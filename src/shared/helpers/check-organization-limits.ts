import { TokenStorage } from "../../main/storages/token-storage"
import { getOrganizationLimits } from "../../main/commands/organization-limits.query"

export function checkOrganizationLimits(): Promise<any> {
  return new Promise((resolve) => {
    if (TokenStorage && TokenStorage.dataIsActual()) {
      getOrganizationLimits(
        TokenStorage.token!.access_token,
        TokenStorage.organizationId!
      )
        .then(() => {
          resolve(true)
        })
        .catch((e) => {
          resolve(true)
        })
    } else {
      resolve(true)
    }
  })
}
