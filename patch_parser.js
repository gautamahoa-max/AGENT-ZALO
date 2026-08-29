const fs = require('fs');
let content = fs.readFileSync('src/zalo/zalo-message-parser.ts', 'utf-8');

const replacement = `    if (picked) {
      images.push({ url: picked.url });
    }
  }

  // Handle stickers and other special types
  if (!text.trim() && images.length === 0) {
    if (msgType.toLowerCase().includes("sticker")) {
      text = "[Khách gửi một icon/sticker]";
    } else if (msgType.toLowerCase().includes("voice")) {
      text = "[Khách gửi một tin nhắn thoại - Bạn không thể nghe, hãy nhờ khách nhắn tin chữ]";
    } else if (msgType.toLowerCase().includes("undo")) {
      text = "[Khách đã thu hồi một tin nhắn]";
    } else if (msgType.toLowerCase().includes("link")) {
      text = "[Khách gửi một đường link]";
    } else {
      text = "[Khách gửi một icon/nhãn dán/nội dung đặc biệt]";
    }
  }

  const mentions = Array.isArray(data.mentions) ? data.mentions : [];`;

content = content.replace(
  `    if (picked) {
      images.push({ url: picked.url });
    }
  }

  const mentions = Array.isArray(data.mentions) ? data.mentions : [];`, replacement);

fs.writeFileSync('src/zalo/zalo-message-parser.ts', content);
