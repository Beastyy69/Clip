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

app.get("/clip", async (req, res) => {
    const user = req.query.user || "Unknown User";
    const message = req.query.message || "No message provided.";
    const now = Math.floor(Date.now() / 1000);

    if (!DISCORD_WEBHOOK_URL || !YOUTUBE_VIDEO_ID || !YOUTUBE_API_KEY) {
        return res.status(500).json({ error: "❌ Missing required environment variables." });
    }

    if (cooldowns[user] && now - cooldowns[user] < COOLDOWN_TIME / 1000) {
        const timeLeft = Math.ceil(COOLDOWN_TIME / 1000 - (now - cooldowns[user]));
        return res.status(429).json({ error: ⚠️ Wait ${timeLeft}s before clipping again. });
    }

    cooldowns[user] = now;

    const streamStartTime = await getStreamStartTime();
    if (!streamStartTime) {
        return res.status(500).json({ error: "❌ Failed to get stream start time." });
    }

    const timestamp = Math.max(now - streamStartTime - 150, 0);
    const clipUrl = https://youtu.be/${YOUTUBE_VIDEO_ID}?t=${timestamp};
    const msg = 🎬 **Clip by ${user}!**\n📝 Message: "${message}"\n🔗 [Watch Clip](${clipUrl});

    try {
        await axios.post(DISCORD_WEBHOOK_URL, { content: msg });
        res.json({ success: true, info: "Clipped successfully 👍 in discord.gg/voidmystery server" });
    } catch (error) {
        console.error("❌ Failed to send clip:", error.message);
        res.status(500).json({ error: "❌ Could not send to Discord." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(🚀 Server running on port ${PORT}));
