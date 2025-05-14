import { IRecordV3 } from "@main/v3/events/record-v3-types"

export interface RecordStoreSchema {
  recordings: {
    [uuid: string]: IRecordV3
  }
  last_created_record: string
}
