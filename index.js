const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

// ✅ Environment Variables
const DISCORD_WEBHOOK_URL = process.env.WEBHOOK_URL;
const YOUTUBE_VIDEO_ID = process.env.YOUTUBE_VIDEO_ID;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const COOLDOWN_TIME = 30 * 1000; // 30 seconds

// ✅ State
let cooldowns = {};              // Stores last /clip usage per user
let messageQueue = [];           // Messages waiting to be sent to Discord
let isRateLimited = false;       // Flag if Discord is rate-limiting
let retryAfter = 0;              // How long to wait after 429

// ✅ Message sending loop (every 3s)
setInterval(async () => {
    if (isRateLimited || messageQueue.length === 0) return;

    const message = messageQueue.shift();
    console.log("🟡 Attempting to send message to Discord:", message);

    try {
        await axios.post(DISCORD_WEBHOOK_URL, { content: message });
        console.log("✅ Message sent to Discord:", message);
    } catch (error) {
        if (error.response?.status === 429) {
            retryAfter = (error.response.headers["retry-after"] || 10) * 1000;
            isRateLimited = true;
            console.warn(`🚫 Rate limited by Discord. Retrying after ${retryAfter / 1000}s`);

            // Re-queue the message
            messageQueue.unshift(message);

            setTimeout(() => {
                isRateLimited = false;
                console.log("🟢 Resuming message sending after cooldown.");
            }, retryAfter);
        } else {
            console.error("❌ Failed to send message:", error.message);
        }
    }
}, 3000);

// ✅ Helper: Get YouTube Stream Start Time
async function getStreamStartTime() {
    try {
        const response = await axios.get(
            `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${YOUTUBE_VIDEO_ID}&key=${YOUTUBE_API_KEY}`
        );
        const details = response.data.items[0]?.liveStreamingDetails;
        return details?.actualStartTime
            ? Math.floor(new Date(details.actualStartTime).getTime() / 1000)
            : null;
    } catch (error) {
        console.error("❌ Error fetching stream start time:", error.message);
        return null;
    }
}

// ✅ /clip Route — Adds a Clip to the Queue
app.get("/clip", async (req, res) => {
    const user = req.query.user || "Unknown User";
    const message = req.query.message || "No message provided.";
    const now = Math.floor(Date.now() / 1000); // in seconds

    if (!DISCORD_WEBHOOK_URL) {
        return res.status(500).json({ error: "❌ Webhook URL not set in environment." });
    }

    if (cooldowns[user] && now - cooldowns[user] < COOLDOWN_TIME / 1000) {
        const wait = Math.ceil(COOLDOWN_TIME / 1000 - (now - cooldowns[user]));
        return res.status(429).json({ error: `⚠️ Too many requests. Try again in ${wait}s.` });
    }

    cooldowns[user] = now;

    const startTime = await getStreamStartTime();
    if (!startTime) {
        return res.status(500).json({ error: "❌ Could not get YouTube stream start time." });
    }

    const timestamp = Math.max(now - startTime - 40, 0); // 40 sec before current
    const clipUrl = `https://youtu.be/${YOUTUBE_VIDEO_ID}?t=${timestamp}`;
    const discordMsg = `🎬 **New Clip from ${user}!**\n📢 Message: "${message}"\n🔗 [Watch Clip](${clipUrl})`;

    messageQueue.push(discordMsg);
    res.send("✅ Clip saved! Will be sent to Discord shortly.");
});

// ✅ /ping Route — Adds a test message
app.get("/ping", (req, res) => {
    if (!DISCORD_WEBHOOK_URL) {
        return res.status(500).send("❌ Webhook URL not set in environment.");
    }

    messageQueue.push("🔔 Ping test from Render: Webhook is working!");
    res.send("✅ Ping added to queue.");
});

// ✅ /send Route — Sends a custom message immediately (without queue)
app.get("/send", async (req, res) => {
    const message = req.query.message || "📢 Test message from /send route!";
    if (!DISCORD_WEBHOOK_URL) {
        return res.status(500).send("❌ Webhook URL not set in environment.");
    }

    try {
        await axios.post(DISCORD_WEBHOOK_URL, { content: message });
        res.send("✅ Message sent to Discord: " + message);
    } catch (error) {
        console.error("❌ Failed to send webhook:", error.message);
        res.status(500).send("❌ Failed to send webhook message.");
    }
});

// ✅ Root Route
app.get("/", (req, res) => {
    res.send("🚀 Server is running! Use /clip, /ping or /send.");
});

// ✅ Start Express Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server live on port ${PORT}`);
});
