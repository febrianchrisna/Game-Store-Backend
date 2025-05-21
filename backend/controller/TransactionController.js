import Transaction from '../models/TransactionModel.js';
import TransactionDetail from '../models/TransactionDetailModel.js';
import Game from '../models/GameModel.js';
import Notification from '../models/NotificationModel.js';
import db from '../config/database.js';

// Get all transactions (admin only)
export const getAllTransactions = async (req, res) => {
    try {
        const transactions = await Transaction.findAll({
            include: [
                {
                    model: TransactionDetail,
                    include: [Game]
                },
                {
                    association: 'user',
                    attributes: ['id', 'username', 'email']
                }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        res.status(200).json(transactions);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get user's transactions
export const getUserTransactions = async (req, res) => {
    try {
        const userId = req.userId;
        
        const transactions = await Transaction.findAll({
            where: { userId },
            include: [
                {
                    model: TransactionDetail,
                    include: [
                        {
                            model: Game,
                            attributes: ['id', 'title', 'price', 'imageUrl', 'platform']
                        }
                    ]
                }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        // Format the response to make game details more accessible
        const formattedTransactions = transactions.map(transaction => {
            const plainTransaction = transaction.get({ plain: true });
            
            // Add game details directly to transaction_details for easier frontend access
            plainTransaction.transaction_details = plainTransaction.transaction_details.map(detail => {
                return {
                    ...detail,
                    gameTitle: detail.game.title,
                    gameImage: detail.game.imageUrl,
                    gamePlatform: detail.game.platform
                };
            });
            
            return plainTransaction;
        });
        
        res.status(200).json(formattedTransactions);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get transaction by ID
export const getTransactionById = async (req, res) => {
    try {
        const transaction = await Transaction.findByPk(req.params.id, {
            include: [
                {
                    model: TransactionDetail,
                    include: [
                        {
                            model: Game,
                            attributes: ['id', 'title', 'price', 'imageUrl', 'platform']
                        }
                    ]
                },
                {
                    association: 'user',
                    attributes: ['id', 'username', 'email']
                }
            ]
        });
        
        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        // Admin can access all transactions, users only their own
        if (req.userRole === 'admin' || req.userId === transaction.userId) {
            // Format the transaction to make game details more accessible
            const plainTransaction = transaction.get({ plain: true });
            
            // Add game details directly to transaction_details
            plainTransaction.transaction_details = plainTransaction.transaction_details.map(detail => {
                return {
                    ...detail,
                    gameTitle: detail.game.title,
                    gameImage: detail.game.imageUrl,
                    gamePlatform: detail.game.platform
                };
            });
            
            return res.status(200).json(plainTransaction);
        } else {
            return res.status(403).json({ message: 'Not authorized to view this transaction' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Create new transaction
export const createTransaction = async (req, res) => {
    const transaction = await db.transaction();
    
    try {
        const { 
            games, 
            paymentMethod, 
            deliveryType,
            steamId,
            street,
            city,
            zipCode,
            country
        } = req.body;
        
        const userId = req.userId;
        
        if (!games || games.length === 0) {
            return res.status(400).json({ message: 'Transaction must contain at least one game' });
        }
        
        // Validate delivery information
        if (deliveryType === 'fisik' || deliveryType === 'keduanya') {
            if (!street || !city || !zipCode || !country) {
                return res.status(400).json({ message: 'Shipping address is required for physical games' });
            }
        }
        
        if (deliveryType === 'digital' || deliveryType === 'keduanya') {
            if (!steamId) {
                return res.status(400).json({ message: 'Steam ID is required for digital games' });
            }
        }
        
        // Calculate total amount and check stock
        let totalAmount = 0;
        const gameUpdates = [];
        const insufficientStockGames = [];
        
        for (const item of games) {
            const game = await Game.findByPk(item.gameId, { transaction });
            
            if (!game) {
                await transaction.rollback();
                return res.status(404).json({ message: `Game with ID ${item.gameId} not found` });
            }
            
            // Check if type matches game availability
            if (item.type === 'fisik' && !game.hasFisik) {
                await transaction.rollback();
                return res.status(400).json({ 
                    message: `Game "${game.title}" is not available in physical format` 
                });
            }
            
            if (item.type === 'digital' && !game.hasDigital) {
                await transaction.rollback();
                return res.status(400).json({ 
                    message: `Game "${game.title}" is not available in digital format` 
                });
            }
            
            // Check stock for physical games
            if (item.type === 'fisik' && game.stock < item.quantity) {
                insufficientStockGames.push({
                    id: game.id,
                    title: game.title,
                    available: game.stock,
                    requested: item.quantity
                });
            } else {
                totalAmount += game.price * item.quantity;
                gameUpdates.push({
                    game,
                    quantity: item.quantity,
                    type: item.type
                });
            }
        }
        
        // If any games have insufficient stock, abort the transaction
        if (insufficientStockGames.length > 0) {
            await transaction.rollback();
            return res.status(400).json({ 
                message: 'Some games have insufficient stock',
                insufficientStockGames 
            });
        }
        
        // Create transaction
        const newTransaction = await Transaction.create({
            userId,
            totalAmount,
            currency: 'IDR', // Default currency
            status: 'pending',
            paymentMethod,
            deliveryType,
            steamId: steamId || null,
            street: street || null,
            city: city || null,
            zipCode: zipCode || null,
            country: country || null
        }, { transaction });
        
        // Create transaction details and update game stock for physical copies
        const transactionDetails = [];
        
        for (const update of gameUpdates) {
            const { game, quantity, type } = update;
            const subtotal = game.price * quantity;
            
            // Update stock only for physical games
            if (type === 'fisik') {
                await game.update({ 
                    stock: game.stock - quantity 
                }, { transaction });
            }
            
            const transactionDetail = await TransactionDetail.create({
                transactionId: newTransaction.id,
                gameId: game.id,
                quantity,
                price: game.price,
                type,
                subtotal
            }, { transaction });
            
            transactionDetails.push({
                ...transactionDetail.toJSON(),
                game: {
                    id: game.id,
                    title: game.title,
                    price: game.price,
                    imageUrl: game.imageUrl
                }
            });
        }
        
        // Create notification for the user
        await Notification.create({
            userId,
            title: 'New Transaction',
            message: `Your order #${newTransaction.id} has been placed and is now being processed.`,
            type: 'transaction',
            isRead: false
        }, { transaction });
        
        await transaction.commit();
        
        res.status(201).json({
            message: 'Transaction created successfully',
            transaction: {
                id: newTransaction.id,
                userId,
                totalAmount,
                status: 'pending',
                paymentMethod,
                deliveryType,
                steamId: steamId || null,
                shippingAddress: (street && city) ? { street, city, zipCode, country } : null,
                createdAt: newTransaction.createdAt,
                transaction_details: transactionDetails
            }
        });
    } catch (error) {
        await transaction.rollback();
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Update transaction status (admin only)
export const updateTransactionStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const transaction = await Transaction.findByPk(req.params.id);
        
        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }
        
        await transaction.update({ status });
        
        // Create notification for the user
        await Notification.create({
            userId: transaction.userId,
            title: 'Transaction Update',
            message: `Your order #${transaction.id} status has been updated to ${status}.`,
            type: 'transaction_update',
            isRead: false
        });
        
        res.status(200).json({
            message: 'Transaction status updated successfully',
            transaction
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Delete transaction (user only) - replacing cancelTransaction
export const deleteTransaction = async (req, res) => {
    const dbTransaction = await db.transaction();
    
    try {
        const userId = req.userId;
        const transactionId = req.params.id;
        
        const transaction = await Transaction.findByPk(transactionId);
        
        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }
        
        // Verify the transaction belongs to the logged-in user
        if (transaction.userId !== userId && req.userRole !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to delete this transaction' });
        }
        
        // Only pending transactions can be deleted
        if (transaction.status !== 'pending') {
            return res.status(400).json({ 
                message: `Cannot delete a transaction that is already ${transaction.status}` 
            });
        }
        
        // Handle stock restoration for deleted transactions with physical games
        const transactionDetails = await TransactionDetail.findAll({
            where: { transactionId: transaction.id },
            include: [Game]
        });
        
        try {
            // Return physical items to inventory
            for (const detail of transactionDetails) {
                if (detail.type === 'fisik') {
                    await Game.increment(
                        { stock: detail.quantity }, 
                        { 
                            where: { id: detail.gameId },
                            transaction: dbTransaction 
                        }
                    );
                }
            }
            
            // Delete transaction details first (foreign key constraint)
            await TransactionDetail.destroy({
                where: { transactionId: transaction.id },
                transaction: dbTransaction
            });
            
            // Delete the transaction itself
            await transaction.destroy({ transaction: dbTransaction });
            
            // Create notification
            await Notification.create({
                userId,
                title: 'Transaction Deleted',
                message: `Your order #${transaction.id} has been deleted.`,
                type: 'transaction_deleted',
                isRead: false
            }, { transaction: dbTransaction });
            
            await dbTransaction.commit();
        } catch (error) {
            await dbTransaction.rollback();
            throw error;
        }
        
        res.status(200).json({
            message: 'Transaction deleted successfully'
        });
    } catch (error) {
        await dbTransaction.rollback();
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Update transaction payment and delivery info (user only)
export const updateTransaction = async (req, res) => {
    try {
        const userId = req.userId;
        const transactionId = req.params.id;
        const { 
            paymentMethod, 
            steamId, 
            street, 
            city, 
            zipCode, 
            country 
        } = req.body;
        
        // Find the transaction
        const transaction = await Transaction.findByPk(transactionId);
        
        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }
        
        // Verify the transaction belongs to the logged-in user
        if (transaction.userId !== userId && req.userRole !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to update this transaction' });
        }
        
        // Only pending transactions can be updated
        if (transaction.status !== 'pending') {
            return res.status(400).json({ 
                message: `Cannot update a transaction that is already ${transaction.status}` 
            });
        }
        
        // Create an update object based on what was provided
        const updateData = {};
        
        // Always allow payment method updates regardless of delivery type
        if (paymentMethod) {
            updateData.paymentMethod = paymentMethod;
        }
        
        // Handle address fields updates for physical delivery
        if (transaction.deliveryType === 'fisik' || transaction.deliveryType === 'keduanya') {
            // If any address field is provided, validate all are present
            if (street || city || zipCode || country) {
                if (!street || !city || !zipCode || !country) {
                    return res.status(400).json({ 
                        message: 'All shipping address fields (street, city, zipCode, country) are required when updating address'
                    });
                }
                
                // All fields are present, add to update
                updateData.street = street;
                updateData.city = city;
                updateData.zipCode = zipCode;
                updateData.country = country;
            }
        }
        
        // Handle Steam ID updates for digital delivery
        if (transaction.deliveryType === 'digital' || transaction.deliveryType === 'keduanya') {
            if (steamId) {
                updateData.steamId = steamId;
            }
        }
        
        // Ensure there's something to update
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ 
                message: 'No valid fields to update were provided'
            });
        }
        
        // Update the transaction
        await transaction.update(updateData);
        
        // Create notification about the update
        await Notification.create({
            userId,
            title: 'Transaction Updated',
            message: `Your order #${transaction.id} information has been updated.`,
            type: 'transaction_updated',
            isRead: false
        });
        
        res.status(200).json({
            message: 'Transaction updated successfully',
            transaction
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
