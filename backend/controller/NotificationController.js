import Notification from '../models/NotificationModel.js';

// Get user notifications
export const getUserNotifications = async (req, res) => {
    try {
        const userId = req.userId;
        
        const notifications = await Notification.findAll({
            where: { userId },
            order: [['createdAt', 'DESC']]
        });
        
        res.status(200).json(notifications);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Mark notification as read
export const markNotificationAsRead = async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = req.userId;
        
        const notification = await Notification.findOne({
            where: { 
                id: notificationId,
                userId
            }
        });
        
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        
        await notification.update({ isRead: true });
        
        res.status(200).json({
            message: 'Notification marked as read',
            notification
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Mark all user notifications as read
export const markAllNotificationsAsRead = async (req, res) => {
    try {
        const userId = req.userId;
        
        await Notification.update(
            { isRead: true },
            { where: { userId, isRead: false } }
        );
        
        res.status(200).json({
            message: 'All notifications marked as read'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
