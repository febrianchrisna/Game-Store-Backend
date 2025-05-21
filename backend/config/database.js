import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const db = new Sequelize(process.env.DB_NAME, process.env.DB_USERNAME, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    dialect: "mysql",
});

// Add a function to sync all models in the correct order
export const syncDatabase = async () => {
    try {
        // Test database connection
        await db.authenticate();
        console.log('Database connection has been established successfully.');
        
        // Instead of altering tables automatically, just sync without altering
        // This avoids adding more keys to tables that already have a lot of indexes
        await db.sync({ alter: false });
        console.log('Database synchronized successfully.');
        
        // For development environments only - uncomment if you need to reset the DB:
        // To reset all tables, use:
        // await db.sync({ force: true });
        // console.log('All tables were dropped and re-created.');
    } catch (error) {
        console.error('Unable to connect to the database or sync models:', error);
        // Log more details about the error
        if (error.name === 'SequelizeDatabaseError') {
            console.error('Database error details:', error.original.sqlMessage);
            console.error('SQL query that caused the error:', error.sql);
        }
    }
};

export default db;