import Game from '../models/GameModel.js';
import { Op } from 'sequelize';

// Get all games with filtering
export const getGames = async (req, res) => {
    try {
        const { 
            category, 
            platform, 
            search, 
            minPrice, 
            maxPrice,
            featured,
            page = 1, 
            limit = 10 
        } = req.query;
        
        let whereClause = {};
        
        // Filter by category if provided
        if (category) {
            whereClause.category = category;
        }
        
        // Filter by platform
        if (platform) {
            whereClause.platform = platform;
        }
        
        // Search by game title
        if (search) {
            whereClause.title = { [Op.like]: `%${search}%` };
        }
        
        // Price range filter
        if (minPrice && maxPrice) {
            whereClause.price = { [Op.between]: [minPrice, maxPrice] };
        } else if (minPrice) {
            whereClause.price = { [Op.gte]: minPrice };
        } else if (maxPrice) {
            whereClause.price = { [Op.lte]: maxPrice };
        }
        
        // Filter for featured games
        if (featured === 'true') {
            whereClause.featured = true;
        }
        
        // Pagination
        const offset = (page - 1) * limit;
        
        const { count, rows: games } = await Game.findAndCountAll({
            where: whereClause,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: offset
        });
        
        res.status(200).json({
            totalItems: count,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            games
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Search games by title
export const searchGames = async (req, res) => {
    try {
        const { query } = req.query;
        
        if (!query) {
            return res.status(400).json({ message: 'Search query is required' });
        }
        
        const games = await Game.findAll({
            where: {
                title: { [Op.like]: `%${query}%` }
            },
            limit: 10
        });
        
        res.status(200).json(games);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get single game by ID
export const getGameById = async (req, res) => {
    try {
        const game = await Game.findByPk(req.params.id);
        
        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }
        
        res.status(200).json(game);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Create new game (admin only)
export const createGame = async (req, res) => {
    try {
        // Make sure we have all required fields
        const { 
            title, 
            description, 
            price, 
            category,
            platform,
            publisher,
            currency,
            releaseDate,
            imageUrl,
            featured,
            hasFisik,
            hasDigital,
            stock
        } = req.body;
        
        // Validate required fields
        if (!title || !description || !price || !category || !platform || !publisher) {
            return res.status(400).json({ 
                message: 'Missing required fields', 
                requiredFields: ['title', 'description', 'price', 'category', 'platform', 'publisher']
            });
        }
        
        // Validate image URL if provided
        if (imageUrl && !isValidURL(imageUrl)) {
            return res.status(400).json({
                message: 'Invalid image URL format',
                field: 'imageUrl'
            });
        }
        
        // Create the game with all fields explicitly set
        const newGame = await Game.create({
            title: title,
            description: description,
            price: price,
            category: category,
            platform: platform,
            publisher: publisher,
            currency: currency || 'IDR',
            releaseDate: releaseDate || null,
            imageUrl: imageUrl || null,
            featured: featured === true ? true : false,
            hasFisik: hasFisik === true ? true : false,
            hasDigital: hasDigital === true ? true : false,
            stock: stock || 0
        });
        
        res.status(201).json(newGame);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Helper function to validate URLs
function isValidURL(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Update game (admin only)
export const updateGame = async (req, res) => {
    try {
        const game = await Game.findByPk(req.params.id);
        
        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }
        
        // Validate image URL if provided
        if (req.body.imageUrl && !isValidURL(req.body.imageUrl)) {
            return res.status(400).json({
                message: 'Invalid image URL format',
                field: 'imageUrl'
            });
        }
        
        await game.update(req.body);
        
        res.status(200).json({
            message: 'Game updated successfully',
            game
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Delete game (admin only)
export const deleteGame = async (req, res) => {
    try {
        const game = await Game.findByPk(req.params.id);
        
        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }
        
        await game.destroy();
        
        res.status(200).json({ message: 'Game deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get game categories
export const getCategories = async (req, res) => {
    try {
        const categories = await Game.findAll({
            attributes: ['category'],
            group: ['category']
        });
        
        res.status(200).json(categories.map(item => item.category));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get game platforms
export const getPlatforms = async (req, res) => {
    try {
        const platforms = await Game.findAll({
            attributes: ['platform'],
            group: ['platform']
        });
        
        res.status(200).json(platforms.map(item => item.platform));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
