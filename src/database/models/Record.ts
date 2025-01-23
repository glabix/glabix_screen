import { DataTypes, Model, Optional, Sequelize } from "sequelize"
import sequelize from "../"
import Chunk from "./Chunk"

export enum RecordStatus {
  RECORDING = "recording",
  RECORDED = "recorded",
  CREATING_ON_SERVER = "creating_on_server",
  CREATED_ON_SERVER = "created_on_server",
  CHUNKS_UPLOADING = "chunks_uploading",
  CHUNKS_UPLOADED = "chunks_uploaded",
  COMPLETED = "completed",
}

interface RecordAttributes {
  uuid: string
  server_uuid: string | null
  version: string
  title: string
  previewSource: string | null
  status: RecordStatus
  createdAt?: Date
  updatedAt?: Date
  Chunks?: Chunk[]
}

export interface RecordCreationAttributes
  extends Optional<
    RecordAttributes,
    "uuid" | "server_uuid" | "previewSource"
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
  },
  {
    sequelize,
    modelName: "Record",
    tableName: "records",
  }
)

export default Record
