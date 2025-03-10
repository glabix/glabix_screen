import { DataTypes, Model, Optional, Sequelize } from "sequelize"
import sequelize from "../"
import Chunk from "./Chunk"

export enum RecordStatus {
  RECORDING = "recording",
  RECORDED = "recorded",
  CREATING_ON_SERVER = "creating_on_server",
  CREATED_ON_SERVER = "created_on_server",
  COMPLETED = "completed",
  CANCELED = "canceled",
}

interface RecordAttributes {
  uuid: string
  server_uuid: string | null
  version: string
  title: string
  previewSource: string | null
  status: RecordStatus
  out_w: number
  out_h: number
  x: number
  y: number
  createdAt?: Date
  updatedAt?: Date
  Chunks?: Chunk[]
}

export interface RecordCreationAttributes
  extends Optional<
    RecordAttributes,
    "uuid" | "server_uuid" | "previewSource" | "out_w" | "out_h" | "x" | "y"
  > {}

class Record
  extends Model<RecordAttributes, RecordCreationAttributes>
  implements RecordAttributes {}

Record.init(
  {
    uuid: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
    },
    server_uuid: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    version: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    previewSource: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(RecordStatus)),
      allowNull: false,
    },
    out_w: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    out_h: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    x: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    y: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Record",
    tableName: "records",
  }
)

export default Record
