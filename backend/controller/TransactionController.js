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
                    include: [Game]
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

// Get transaction by ID
export const getTransactionById = async (req, res) => {
    try {
        const transaction = await Transaction.findByPk(req.params.id, {
            include: [
                {
                    model: TransactionDetail,
                    include: [Game]
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
            return res.status(200).json(transaction);
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

// Cancel transaction (user only)
export const cancelTransaction = async (req, res) => {
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
            return res.status(403).json({ message: 'Not authorized to modify this transaction' });
        }
        
        // Check if the transaction is in a status that can be cancelled
        if (transaction.status === 'completed' || transaction.status === 'cancelled') {
            return res.status(400).json({ 
                message: `Cannot cancel a transaction that is already ${transaction.status}` 
            });
        }
        
        // Handle stock restoration for cancelled transactions with physical games
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
            
            // Update transaction status
            await transaction.update({ status: 'cancelled' }, { dbTransaction });
            
            // Create notification
            await Notification.create({
                userId,
                title: 'Transaction Cancelled',
                message: `Your order #${transaction.id} has been cancelled.`,
                type: 'transaction_cancelled',
                isRead: false
            }, { transaction: dbTransaction });
            
            await dbTransaction.commit();
        } catch (error) {
            await dbTransaction.rollback();
            throw error;
        }
        
        res.status(200).json({
            message: 'Transaction cancelled successfully',
            transaction
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
