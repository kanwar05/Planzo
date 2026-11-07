import net from "node:net";

// Loopback capture only: no relay, authentication or external delivery exists.
export async function createLocalSmtpCapture(allowedRecipients) {
  const allowed = new Set(allowedRecipients.map((value) => value.toLowerCase()));
  const messages = [];
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    socket.setTimeout(15000, () => socket.destroy());
    let buffer = "";
    let data = false;
    let recipients = [];
    socket.write("220 localhost ESMTP isolated capture\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (buffer.length > 1024 * 1024) { socket.destroy(); return; }
      while (buffer.includes("\r\n")) {
        if (data) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end < 0) return;
          const raw = buffer.slice(0, end).replace(/^\.\./gm, ".");
          buffer = buffer.slice(end + 5);
          const subject = raw.match(/^Subject:\s*(.+)$/im)?.[1]?.trim() || "";
          const decoded = raw.replace(/=\r?\n/g, "").replace(/=([a-f0-9]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
          messages.push({ to: [...recipients], subject, decoded, raw });
          recipients = [];
          data = false;
          socket.write("250 2.0.0 captured locally\r\n");
          continue;
        }
        const end = buffer.indexOf("\r\n");
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (/^(?:EHLO|HELO)\b/i.test(line)) socket.write("250-localhost\r\n250 SIZE 1048576\r\n");
        else if (/^MAIL FROM:/i.test(line)) { recipients = []; socket.write("250 OK\r\n"); }
        else if (/^RCPT TO:/i.test(line)) {
          const recipient = line.match(/<([^>]+)>/)?.[1]?.toLowerCase();
          if (!allowed.has(recipient)) socket.write("550 5.7.1 recipient refused\r\n");
          else { recipients.push(recipient); socket.write("250 OK\r\n"); }
        } else if (/^DATA$/i.test(line) && recipients.length) { data = true; socket.write("354 end with dot\r\n"); }
        else if (/^QUIT$/i.test(line)) { socket.end("221 bye\r\n"); return; }
        else if (/^(?:RSET|NOOP)\b/i.test(line)) socket.write("250 OK\r\n");
        else socket.write("502 unsupported\r\n");
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    host: "127.0.0.1", port: server.address().port, messages,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
