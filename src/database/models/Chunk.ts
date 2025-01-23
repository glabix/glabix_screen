import { DataTypes, Model, Optional, Sequelize } from "sequelize"
import sequelize from "../"
import Record from "./Record"

export enum ChunkStatus {
  SAVING = "saving",
  PENDING = "pending",
  LOADING = "loading",
  LOADED = "loaded",
}

interface ChunkAttributes {
  uuid: string
  size: number
  fileUuid: string
  source: string | null
  status: ChunkStatus
  index: number
  createdAt?: Date
  updatedAt?: Date
}

export interface ChunkCreationAttributes
  extends Optional<ChunkAttributes, "uuid" | "source"> {}

class Chunk
  extends Model<ChunkAttributes, ChunkCreationAttributes>
  implements ChunkAttributes {}

Chunk.init(
  {
    uuid: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
    },
    fileUuid: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: Record,
        key: "uuid",
      },
      onDelete: "CASCADE",
    },
    source: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    index: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(ChunkStatus)),
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "Chunk",
    tableName: "chunks",
  }
)

Chunk.belongsTo(Record, { foreignKey: "fileUuid" })
Record.hasMany(Chunk, { foreignKey: "fileUuid", onDelete: "CASCADE" })

export default Chunk
