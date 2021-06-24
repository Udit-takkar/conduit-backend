const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { route } = require("./auth");
const { verifyToken } = require("../middlewares/auth.middlewares");

// Get Current User
router.get("/", verifyToken, async (req, res) => {
  try {
    const user = await User.findById({ _id: req.userData.sub });
    // console.log(user)
    return res.status(200).send({ user: user.toUserJSON() });
  } catch (err) {
    return res.status(404).send("Not Found User");
  }
});

// Update User

router.patch("/", verifyToken, async (req, res) => {
  try {
    const user = await User.findById({ _id: req.userData.sub });

    if (req.body.user.username) {
      user.username = req.body.user.username;
    }
    if (req.body.user.email) {
      user.email = req.body.user.email;
    }
    if (req.body.user.bio) {
      user.bio = req.body.user.bio;
    }
    if (req.body.user.image) {
      user.image = req.body.user.image;
    }
    if (req.body.user.password) {
      user.setPassword(req.body.user.password);
    }
    await user.save();

    res.status(200).send({ user: user.toUserJSON() });
  } catch (err) {
    res.status(404);
    res.send({ error: err, message: "User Does not exist" });
  }
});

module.exports = router;
