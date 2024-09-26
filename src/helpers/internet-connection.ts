import { net } from "electron"

export class InternetConnection {
  static get isOnline() {
    return net.isOnline()
  }
}
