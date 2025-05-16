import { TokenStorage } from "@main/storages/token-storage"
import { openExternalLink } from "@shared/helpers/open-external-link"
import { RecordStoreManager } from "@main/v3/store/record-store-manager"

export class OpenLibraryPageHandler {
  store = new RecordStoreManager()
  checkToOpenLibraryPage(recordingLocalUuid: string) {
    const recording = this.store.getRecording(recordingLocalUuid)
    const lastUuid = this.store.getLastCreatedRecordCache()
    if (lastUuid !== recordingLocalUuid) {
      return
    }
    if (!recording) {
      throw new Error(`Recording ${recordingLocalUuid} not found`)
    }
    const lastChunk = Object.entries(recording.chunks).find(([_, c]) => {
      return c.isLast
    })
    if (recording.serverUuid && lastChunk) {
      const shared =
        import.meta.env.VITE_AUTH_APP_URL +
        "recorder/org/" +
        TokenStorage.organizationId +
        "/" +
        "library/" +
        recording.serverUuid
      openExternalLink(shared)
    }
  }
}
