import User from './UserModel.js';
import Game from './GameModel.js';
import Transaction from './TransactionModel.js';
import TransactionDetail from './TransactionDetailModel.js';
import Notification from './NotificationModel.js';

// User associations
User.hasMany(Transaction, { foreignKey: 'userId' });
User.hasMany(Notification, { foreignKey: 'userId' });

// Transaction associations
Transaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Transaction.hasMany(TransactionDetail, { foreignKey: 'transactionId' });

// Game associations
Game.hasMany(TransactionDetail, { foreignKey: 'gameId' });

// TransactionDetail associations
TransactionDetail.belongsTo(Transaction, { foreignKey: 'transactionId' });
TransactionDetail.belongsTo(Game, { foreignKey: 'gameId' });

// Notification associations
Notification.belongsTo(User, { foreignKey: 'userId' });

export {
  User,
  Game,
  Transaction,
  TransactionDetail,
  Notification
};
