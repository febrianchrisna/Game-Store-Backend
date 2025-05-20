import express from 'express';
import { login, register, logout, getUser, updateUserProfile } from '../controller/UserController.js';
import { 
    getGames, getGameById, createGame, 
    updateGame, deleteGame, getCategories,
    searchGames, getPlatforms
} from '../controller/GameController.js';
import { 
    getAllTransactions, getUserTransactions, getTransactionById, 
    createTransaction, updateTransactionStatus, cancelTransaction
} from '../controller/TransactionController.js';
import { 
    getUserNotifications, markNotificationAsRead, markAllNotificationsAsRead 
} from '../controller/NotificationController.js';
import { verifyToken, isAdmin } from '../middleware/AuthMiddleware.js';
import { refreshToken } from '../controller/RefreshToken.js';

const router = express.Router();

// ==================== AUTH ROUTES (untuk semua) ====================
router.post("/api/auth/login", login);
router.post("/api/auth/register", register);
router.get("/api/auth/logout", verifyToken, logout);
router.get("/api/auth/token", refreshToken);
router.get("/api/auth/profile", verifyToken, getUser);
router.put("/api/auth/profile", verifyToken, updateUserProfile);

// ==================== ADMIN ROUTES (khusus admin) ====================
// User management (admin only)
router.get("/api/users", verifyToken, isAdmin, getUser);

// Game management (admin only)
router.post("/api/games", verifyToken, isAdmin, createGame);
router.put("/api/games/:id", verifyToken, isAdmin, updateGame);
router.delete("/api/games/:id", verifyToken, isAdmin, deleteGame);

// Transaction Status management (admin only)
router.get("/api/transactions", verifyToken, isAdmin, getAllTransactions);
router.put("/api/transactions/:id/status", verifyToken, isAdmin, updateTransactionStatus);

// ==================== USER ROUTES (khusus user) ====================
// Game browsing (user & public)
router.get("/api/games", getGames);
router.get("/api/games/search", searchGames);
router.get("/api/games/categories", getCategories);
router.get("/api/games/platforms", getPlatforms);
router.get("/api/games/:id", getGameById);

// Transaction management (user only)
router.get("/api/transactions", verifyToken, getUserTransactions);
router.get("/api/transactions/:id", verifyToken, getTransactionById);
router.post("/api/transactions", verifyToken, createTransaction);
router.put("/api/transactions/:id/cancel", verifyToken, cancelTransaction);

// Notification routes
router.get("/api/notifications", verifyToken, getUserNotifications);
router.put("/api/notifications/:id/read", verifyToken, markNotificationAsRead);
router.put("/api/notifications/read-all", verifyToken, markAllNotificationsAsRead);

// ==================== HEALTH CHECK ====================
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

export default router;
