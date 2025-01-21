import { Sequelize } from "sequelize"
import path from "path"
import { app } from "electron"

const appDataPath = app.getPath("userData")
const dbPath = path.join(appDataPath, "Database")

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: path.join(dbPath, "db.sqlite"), // Путь к базе данных,
  logging: console.log,
})

export default sequelize
