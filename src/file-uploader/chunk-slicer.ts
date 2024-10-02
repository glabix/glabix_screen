export class ChunkSlicer {
  readonly chunkSize: number
  private chunks: ArrayBuffer[] = []
  private chunkEnd = 0
  private chunkStart = 0
  readonly file: ArrayBuffer
  private currentChunkCounter = 0
  private numberOfChunks = 0
  constructor(file: ArrayBuffer, chunkSize: number) {
    this.file = file
    this.chunkSize = chunkSize
    this.process()
  }

  get allChunks() {
    return this.chunks
  }

  private process() {
    this.numberOfChunks = Math.ceil(this.file.byteLength / this.chunkSize)
    this.createChunk()
  }

  private createChunk() {
    this.currentChunkCounter++
    this.chunkEnd = Math.min(
      this.chunkStart + this.chunkSize,
      this.file.byteLength
    )
    const chunk = this.file.slice(this.chunkStart, this.chunkEnd)
    this.chunks = [...this.chunks, chunk]
    this.chunkStart += this.chunkSize
    if (this.chunkStart < this.file.byteLength) {
      this.createChunk()
    }
  }
}
