// Length-prefixed message framing over stdin.
//
// Neovim writes each message as a 4-byte big-endian uint32 length followed by
// that many bytes of UTF-8 JSON. This framing is robust to newlines embedded in
// buffer content (which a line-delimited protocol would choke on).

export interface ContentMessage {
  type: "content";
  /** Full buffer text. */
  text: string;
  /** Absolute path of the directory containing the markdown file (for relative assets). */
  baseDir: string;
  /** Absolute path of the markdown file itself, if saved. */
  path: string;
}

export interface ScrollMessage {
  type: "scroll";
  /** 1-based cursor line in the source buffer. */
  line: number;
}

export interface ConfigMessage {
  type: "config";
  theme: "light" | "dark";
  [key: string]: unknown;
}

export interface StatusMessage {
  type: "status";
  /** Whether the buffer is actively feeding updates (false = paused). */
  live: boolean;
}

export type InboundMessage = ContentMessage | ScrollMessage | ConfigMessage | StatusMessage;

/**
 * Read length-prefixed JSON messages from a byte stream, yielding each decoded
 * message. Buffers partial frames across chunk boundaries.
 */
export async function* readMessages(
  reader: ReadableStream<Uint8Array>,
): AsyncGenerator<InboundMessage> {
  const decoder = new TextDecoder();
  let buf: Uint8Array<ArrayBuffer> = new Uint8Array(0);

  for await (const chunk of reader) {
    buf = concat(buf, chunk);

    // Drain as many complete frames as the buffer currently holds.
    while (buf.length >= 4) {
      const len = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0, false);
      if (buf.length < 4 + len) break; // wait for more bytes
      const payload = buf.subarray(4, 4 + len);
      buf = buf.subarray(4 + len);
      try {
        yield JSON.parse(decoder.decode(payload)) as InboundMessage;
      } catch (_e) {
        // Ignore malformed frames rather than tearing down the stream.
      }
    }
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
