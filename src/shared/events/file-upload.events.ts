export enum FileUploadEvents {
  RECORD_CREATED = "record-created",

  TRY_CREATE_FILE_ON_SERVER = "try-create-file-on-server",

  FILE_CREATED = "file-created",
  FILE_CREATED_ON_SERVER = "file-created-on-server",
  FILE_CREATE_ON_SERVER_ERROR = "file-create-on-server-error",

  CHUNKS_SLICED = "chunks-sliced",

  LOAD_FILE_CHUNK = "load-file-chunk",
  FILE_CHUNK_UPLOADED = "file-chunk-uploaded",
  FILE_UPLOADED = "file-uploaded",
}
