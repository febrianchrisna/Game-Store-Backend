import { Sequelize } from "sequelize";
import db from "../config/database.js";
import Transaction from "./TransactionModel.js";
import Game from "./GameModel.js";

const { DataTypes } = Sequelize;

const TransactionDetail = db.define("transaction_details", {
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    subtotal: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    type: {
        type: DataTypes.ENUM('fisik', 'digital'),
        allowNull: false
    },
    transactionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Transaction,
            key: 'id'
        }
    },
    gameId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Game,
            key: 'id'
        }
    }
}, 
{ freezeTableName: true }
);

export default TransactionDetail;
