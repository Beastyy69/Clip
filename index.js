const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

const DISCORD_WEBHOOK_URL = process.env.WEBHOOK_URL;
const YOUTUBE_VIDEO_ID = process.env.YOUTUBE_VIDEO_ID;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const COOLDOWN_TIME = 30 * 1000;

let cooldowns = {};
let messageQueue = [];
let isRateLimited = false;
let retryAfter = 0;

// 🕓 Message sender loop
setInterval(async () => {
    if (isRateLimited || messageQueue.length === 0) return;

    const message = messageQueue.shift();
    try {
        await axios.post(DISCORD_WEBHOOK_URL, { content: message });
        console.log("✅ Message sent to Discord:", message);
    } catch (error) {
        if (error.response?.status === 429) {
            isRateLimited = true;
            retryAfter = (error.response.headers["retry-after"] || 10) * 1000;
            console.warn(🚫 Rate limited by Discord. Retrying after ${retryAfter / 1000}s);

            // Push the message back into queue
            messageQueue.unshift(message);

            // Wait before retrying
            setTimeout(() => {
                isRateLimited = false;
            }, retryAfter);
        } else {
            console.error("❌ Failed to send message:", error.message);
        }
    }
}, 3000); // Try sending every 3 seconds (safe interval)

// ✅ Function to get stream start time
async function getStreamStartTime() {
    try {
        const response = await axios.get(
            https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${YOUTUBE_VIDEO_ID}&key=${YOUTUBE_API_KEY}
        );
        const streamDetails = response.data.items[0]?.liveStreamingDetails;
        return streamDetails?.actualStartTime
            ? Math.floor(new Date(streamDetails.actualStartTime).getTime() / 1000)
            : null;
    } catch (error) {
        console.error("❌ Error fetching stream start time:", error.message);
        return null;
    }
}

// ✅ /clip route – sends to queue
app.get("/clip", async (req, res) => {
    const user = req.query.user || "Unknown User";
    const message = req.query.message || "No message provided.";
    const now = Math.floor(Date.now() / 1000);

    if (!DISCORD_WEBHOOK_URL) {
        return res.status(500).json({ error: "❌ Webhook URL not set." });
    }

    if (cooldowns[user] && now - cooldowns[user] < COOLDOWN_TIME / 1000) {
        const timeLeft = Math.ceil(COOLDOWN_TIME / 1000 - (now - cooldowns[user]));
        return res.status(429).json({ error: ⚠️ Too many requests! Wait ${timeLeft}s. });
    }

    cooldowns[user] = now;

    const streamStartTime = await getStreamStartTime();
    if (!streamStartTime) {
        return res.status(500).json({ error: "❌ Could not fetch stream start time." });
    }

    const timestamp = Math.max(now - streamStartTime - 150, 0);
    const clipUrl = https://youtu.be/${YOUTUBE_VIDEO_ID}?t=${timestamp};
    const msg = 🎬 **New Clip from ${user}!**\n📢 Message: "${message}"\n🔗 [Watch Clip](${clipUrl});

    messageQueue.push(msg);
    res.json({ queued: true, info: "✅ Clip added to queue. Will be sent shortly." });
});

// ✅ /ping route – sends to queue
app.get("/ping", (req, res) => {
    if (!DISCORD_WEBHOOK_URL) {
        return res.status(500).send("❌ Webhook URL not set.");
    }

    messageQueue.push("🔔 Ping test from Render: Webhook is working!");
    res.send("✅ Ping added to queue. Will be sent shortly.");
});

// ✅ Root route
app.get("/", (req, res) => {
    res.send("🚀 Server running. Use /clip or /ping to test.");
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(🚀 Server live on port ${PORT})); 
app.get("/send", async (req, res) => {
    const message = req.query.message || "📢 Test message from /send route!";
    try {
        await axios.post(process.env.WEBHOOK_URL, {
            content: message,
        });
        res.send("✅ Message sent to Discord: " + message);
    } catch (error) {
        console.error("❌ Failed to send webhook:", error.message);
        res.status(500).send("❌ Failed to send webhook message.");
    }
});
