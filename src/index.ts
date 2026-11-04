import { startBot } from "./bot/index.js";

async function main() {
    console.log("Starting bot...");
    const { botInfo, webhookEnabled } = await startBot();

    if (webhookEnabled) {
        const { startServer } = await import("./server/index.js");
        
        console.log("Starting server...");
        startServer();
        console.log("🚀 Server started!");
    }

    console.log("🚀 Bot started!");

    console.log(
        `👤 Bot info:\n` +
            ` - ID: ${botInfo.id}\n` +
            ` - Username: ${botInfo.username}\n` +
            ` - First name: ${botInfo.first_name}\n` +
            ` - Webhook URL: ${webhookEnabled ? "✓ Enabled" : "✕ Disabled"}\n`,
    );
}

main();
