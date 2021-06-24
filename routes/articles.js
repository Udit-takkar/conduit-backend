const express = require("express");
const router = express.Router();
const Article = require("../models/Article");
const User = require("../models/User");
const Comment = require("../models/Comment");
const { route } = require("./auth");
const { verifyToken } = require("../middlewares/auth.middlewares");
const slug = require("slug");
const { findById, findOneAndDelete } = require("../models/Article");

router.get("/", async (req, res) => {
  try {
    let loggedInUser = null;

    if (typeof req.userData !== "undefined") {
      loggedInUser = await User.findOne({ _id: user.userData.sub });
    }

    const query = {};
    let limit = 20;
    let offset = 0;

    if (typeof req.query.limit !== "undefined") {
      limit = req.query.limit;
    }

    if (typeof req.query.offset !== "undefined") {
      offset = req.query.offset;
    }

    if (typeof req.query.tag !== "undefined") {
      query.tagList = { $in: [req.query.tag] };
    }

    if (typeof req.query.author !== "undefined" && req.query.author) {
      const user = await User.findOne({ username: req.query.author });
      query.author = user._id;
    }
    if (typeof req.query.favorited !== "undefined" && req.query.favorited) {
      const user = await User.findOne({ username: req.query.favorited });
      query._id = user._id;
    }

    const articles = await Article.find(query)
      .limit(Number(limit))
      .skip(Number(offset))
      .sort({ createdAt: "desc" })
      .populate("author")
      .exec();

    const articlesCount = await Article.countDocuments(query);

    res.status(200).send({
      articles: articles.map(function (article) {
        return article.toJSONFor(loggedInUser);
      }),
      articlesCount,
    });
  } catch (err) {
    return res.status(404).send(err);
  }
});

//  Get Feed Articles
router.get("/feed", verifyToken, async (req, res) => {
  try {
    let limit = 20;
    let offset = 0;

    if (typeof req.query.limit !== "undefined") {
      limit = req.query.limit;
    }

    if (typeof req.query.offset !== "undefined") {
      offset = req.query.offset;
    }

    const user = await User.findById({ _id: req.userData.sub });
    if (!user) {
      return res.status(401);
    }

    Promise.all([
      Article.find({ author: { $in: user.following } })
        .limit(Number(limit))
        .skip(Number(offset))
        .populate("author")
        .exec(),
      Article.countDocuments({ author: { $in: user.following } }),
    ]).then(function (results) {
      var articles = results[0];
      var articlesCount = results[1];

      return res.json({
        articles: articles.map(function (article) {
          return article.toJSONFor(user);
        }),
        articlesCount: articlesCount,
      });
    });
  } catch (err) {}
});

// Get article By Slug
router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const article = await Article.findOne({ slug });

    if (!article) return res.status(404).send("Not Found");

    await article.populate({
      path: "author",
    });

    return res.status(200).send({ article: article.toJSONFor() });
  } catch (err) {
    return res.send(err);
  }
});

//  Create Article
router.post("/", verifyToken, async (req, res) => {
  try {
    // console.log(req.userData.sub);
    const user = await User.findById({ _id: req.userData.sub });

    if (!user) {
      return res.status(401).send("User UnAuthorized");
    }

    const article = new Article(req.body.article);
    article.author = user;
    await article.save();

    return res.status(201).send({ article: article.toJSONFor(user) });
  } catch (err) {
    return res.send(err);
  }
});

//  Update Article
router.put("/:slug", verifyToken, async (req, res) => {
  try {
    const { slug } = req.params;
    const user = await User.findById(req.userData.sub);
    const article = await Article.findOne({ slug }).populate("author");

    if (article?.author._id.toString() === user._id.toString()) {
      if (typeof req.body.article.title !== "undefined") {
        article.title = req.body.article.title;
        article.slug = slugify(req.body.article.title);
      }
      if (typeof req.body?.article.description !== "undefined") {
        article.description = req.body.article.description;
      }

      if (typeof req.body?.article.body !== "undefined") {
        article.body = req.body.article.body;
      }

      if (typeof req.body?.article.tagList !== "undefined") {
        article.tagList = req.body.article.tagList;
      }

      return res.status(200).send({ article: article.toJSONFor(user) });
    } else {
      return res.status(403).send("Unauthorized");
    }
  } catch (err) {
    console.log(err);
    res.send(err);
  }
});

// Delete Article
router.delete("/:slug", verifyToken, async (req, res) => {
  try {
    const { slug } = req.params;
    const user = await User.findById(req.userData.sub);
    const article = await Article.findOne({ slug });

    if (article.author._id.toString() === user._id.toString()) {
      await Article.deleteOne({ slug });
      return res.status(200).send("Success");
    } else {
      return res.status(403).send("UnAuthorized");
    }
  } catch (err) {
    return res.send(err);
  }
});

//  Favorite article
router.post("/:slug/favorite", verifyToken, async (req, res, next) => {
  try {
    const { slug } = req.params;

    const user = await User.findOne({ _id: req.userData.sub });
    const article = await Article.findOne({ slug });
    if (!article) return res.status(404);
    await article.populate("author", function (err) {
      console.log(err);
    });
    // console.log(user);
    await user.favorite(article._id);
    await article.updateFavoriteCount();
    // console.log(article);
    return res.status(200).send({ article: article.toJSONFor(user) });
  } catch (err) {
    console.log(err);
    return res.send(err);
  }
});

router.delete("/:slug/unfavorite", verifyToken, async (req, res, next) => {
  try {
    const { slug } = req.params;

    const user = await User.findOne({ _id: req.userData.sub });
    const article = await Article.findOne({ slug });
    if (!article) return res.status(404);

    await article.populate("author", function (err) {
      console.log(err);
    });

    await user.unfavorite(article._id);
    await article.updateFavoriteCount();

    return res.status(200).send({ article: article.toJSONFor(user) });
  } catch (err) {
    console.log(err);
    return res.send(err);
  }
});

// Post a Comment

router.post("/:slug/comments", verifyToken, async (req, res) => {
  try {
    const { slug } = req.params;

    if (typeof req.body?.comment?.body === "undefined") {
      return res.status(400).send("Empty Comment");
    }

    const comment = new Comment({ body: req.body.comment.body });
    const user = await User.findOne({ _id: req.userData.sub });
    const article = await Article.findOne({ slug });
    if (!article) return res.status(400).send("Article Not found");

    comment.author = req.userData.sub;
    comment.article = article._id;

    await comment.save();
    article.comments.push(comment._id);
    await article.save();

    comment.populate("author", function (err) {
      if (err) return res.send(err);
      res.status(200).send({ comment: comment.toJSONFor(user) });
    });
  } catch (err) {
    console.log(err);
    res.send(err);
  }
});

// Delete a comment
router.delete("/:slug/comments/:id", verifyToken, async (req, res) => {
  try {
    const { slug } = req.params;
    const { id } = req.params;
    console.log(id);
    let article = await Article.findOne({ slug });
    if (!article) return res.status(404).send("Not Found");

    if (!article.comments.includes(id)) {
      return res.status(404).send("Not Found");
    }
    await article.populate("comments").execPopulate();
    // console.log(article.comments);
    const comment = article.comments.find((comment) => {
      console.log(comment._id, id, comment._id.toString() === id.toString());
      return comment._id.toString() === id.toString();
    });

    if (comment.author.toString() === req.userData.sub.toString()) {
      article.comments = article.comments.filter((comment) => {
        return comment._id.toString() !== id.toString();
      });
      console.log(article);
      await article.save();
      await Comment.findByIdAndDelete({ _id: id });

      return res.status(200).send("Success");
    } else {
      res.status(403).send("Unauthorized");
    }
  } catch (err) {
    console.log(err);
    return res.send(err);
  }
});

router.get("/:slug/comments", verifyToken, async (req, res) => {
  try {
    let user = null;
    const { slug } = req.params;
    if (req.token) {
      user = await await User.findById({ _id: req.userData.sub });
    }
    const article = await Article.findOne({ slug });
    if (!article) return res.sendStatus(404);

    await article.populate("comments").execPopulate();
    Promise.all(
      article.comments.map(async function (comment) {
        return comment.populate("author").execPopulate();
      })
    ).then((comments, err) => {
      return res.send({
        comments: comments.map((comment) => {
          return comment.toJSONFor(user);
        }),
      });
    });
  } catch (err) {
    return res.send(err);
  }
});

function slugify(title) {
  return (
    slug(title) + "-" + ((Math.random() * Math.pow(36, 6)) | 0).toString(36)
  );
}

module.exports = router;
