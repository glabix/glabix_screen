import { IRecordV3 } from "@main/v3/events/record-v3-types"
import { ICropVideoData } from "@shared/types/types"

export interface RecordStoreSchema {
  recordings: {
    [uuid: string]: IRecordV3
  }
  last_created_record: string
}
