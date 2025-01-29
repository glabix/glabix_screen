import { Sequelize } from "sequelize"
import path from "path"
import { app } from "electron"
import sqlite3 from "sqlite3"
const appDataPath = app.getPath("userData")
const dbPath = path.join(appDataPath, "Database")

const sequelize = new Sequelize({
  dialect: "sqlite",
  dialectModule: sqlite3,
  storage: path.join(dbPath, "db.sqlite"), // Путь к базе данных,
  logging: false,
})

export default sequelize
