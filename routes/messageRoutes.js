const express = require("express");
const router = express.Router();

const { authenticateToken } = require("../middleware/auth");
const { askQuestion, answerQuestion } = require("../controllers/messageController");
const {
  getChats,
  getConversationMessages,
  getVehicleConversation,
} = require("../controllers/chatController");

router.get("/chats", authenticateToken, getChats);
router.get("/vehicle/:vehicleId/conversation", authenticateToken, getVehicleConversation);
router.get("/conversations/:conversationId/messages", authenticateToken, getConversationMessages);
router.post("/vehicle/:vehicleId", authenticateToken, askQuestion);
router.post("/:id/answer", authenticateToken, answerQuestion);

module.exports = router;
