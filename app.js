const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");

const dbPath = path.join(__dirname, "twitterClone.db");

const app = express();
app.use(express.json());

let db = null;

const initializeServerAndDatabase = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};

initializeServerAndDatabase();

// register user api
app.get("/" , (req,res)=> {
res.send("Hello world!")
})
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPasswd = await bcrypt.hash(password, 10);

  const isUsernameRegisteredQuery = `
  select 
  * 
  from 
  user 
  where username = '${username}';
  `;
  const isUsernameRegistered = await db.get(isUsernameRegisteredQuery);

  if (isUsernameRegistered === undefined) {
    if (password.length < 6) {
      response.statusCode = 400;
      response.send("Password is too short");
    } else {
      const registerUserQuery = `
  insert into user(name,username,password,gender) 
  values 
  ('${name}','${username}','${hashedPasswd}','${gender}');`;

      const registerUser = await db.run(registerUserQuery);
      console.log(registerUser.lastID);
      response.statusCode = 200;
      response.send("User created successfully");
    }
  } else {
    response.statusCode = 400;
    response.send("User already exists");
  }
});

//login api
app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const isUserRegisteredQuery = `
    select 
    * 
    from 
    user 
    where username = '${username}';`;

  const userDetails = await db.get(isUserRegisteredQuery);
  if (userDetails === undefined) {
    response.statusCode = 400;
    response.send("Invalid user");
  } else {
    const isPasswordCorrect = await bcrypt.compare(
      password,
      userDetails.password
    );
    if (isPasswordCorrect === true) {
      const payload = {
        username: username,
      };
      let jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
      console.log(jwtToken);
    } else {
      response.statusCode = 400;
      response.send("Invalid password");
    }
  }
});

// authenticate token middleware function
const authenticateToken = async (request, response, next) => {
  let jwtToken;
  const authHeaders = request.headers["authorization"];
  if (authHeaders === undefined) {
    response.statusCode = 401;
    response.send("Invalid JWT Token");
  } else {
    jwtToken = authHeaders.split(" ")[1];
    if (jwtToken !== undefined) {
      jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
        if (error) {
          response.statusCode = 401;
          response.send("Invalid JWT Token");
        } else {
          const getUserIdQuery = `
   select * 
    from 
    user 
    where 
    username = '${payload.username}';
  `;

          const userDetails = await db.get(getUserIdQuery);
          // console.log(userDetails);
          request.username = payload.username;
          next();
        }
      });
    } else {
      response.statusCode = 401;
      response.send("Invalid JWT Token");
    }
  }
};

// api3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserIdQuery = `
   select * 
    from 
    user 
    where 
    username = '${username}';
  `;

  const userDetails = await db.get(getUserIdQuery);
  const getFeedQuery = `
  select 
  user.username ,
  tweet.tweet, 
  tweet.date_time as dateTime 
  from 
  user 
  inner join tweet on user.user_id = tweet.user_id 
  where 
  user.user_id in 
  (
      select following_user_id 
      from follower 
      where follower_user_id = ${userDetails.user_id}
  )
  order by tweet.date_time desc
  limit 4 ;`;

  const userFeed = await db.all(getFeedQuery);
  response.send(userFeed);
});
//api4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
   select * 
    from 
    user 
    where 
    username = '${username}';
  `;

  const userDetails = await db.get(getUserIdQuery);
  const getUserFollowingQuery = `
  select 
  following_user_id
  from 
  follower 
  where 
  follower_user_id = '${userDetails.user_id}'`;

  const userFollowingList = await db.all(getUserFollowingQuery);
  let userFollowingArray = [];

  for (let user of userFollowingList) {
    const getUsernameQuery = `
    select 
    name
    from 
    user 
    where 
    user_id = '${user.following_user_id}';`;

    const userProfile = await db.get(getUsernameQuery);
    userFollowingArray.push(userProfile);
  }
  response.send(userFollowingArray);
});

// api5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
   select * 
    from 
    user 
    where 
    username = '${username}';
  `;

  const userDetails = await db.get(getUserIdQuery);
  const getUserFollowersQuery = `
  select 
  follower_user_id
  from 
  follower 
  where 
  following_user_id = '${userDetails.user_id}'`;

  const userFollowersList = await db.all(getUserFollowersQuery);
  let userFollowersArray = [];

  for (let user of userFollowersList) {
    const getUsernameQuery = `
    select 
    name
    from 
    user 
    where 
    user_id = '${user.follower_user_id}';`;

    const userProfile = await db.get(getUsernameQuery);
    userFollowersArray.push(userProfile);
  }
  response.send(userFollowersArray);
});

//api6
app.get("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;

  const getUserIdQuery = `
   select * 
    from 
    user 
    where 
    username = '${username}';
  `;

  const userDetails = await db.get(getUserIdQuery);

  const getTweetQuery = `
    select 
    tweet.tweet ,
    count(distinct like.like_id) as likes,
    count(distinct reply.reply_id) as replies ,
    tweet.date_time as dateTime 
    from 
    (tweet 
    inner join 
    like on tweet.tweet_id = like.tweet_id) as t inner join reply on t.tweet_id = reply.tweet_id
    where tweet.user_id in 
    (
select 
  following_user_id
  from 
  follower 
  where 
  follower_user_id = ${userDetails.user_id}
    ) and tweet.tweet_id = ${tweetId};`;

  const tweet = await db.all(getTweetQuery);
  if (tweet[0].tweet === null) {
    response.statusCode = 401;
    response.send("Invalid Request");
  } else {
    response.send(tweet[0]);
  }
});

//api7
app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const getUserIdQuery = `
   select * 
    from 
    user 
    where 
    username = '${username}';
  `;

    const userDetails = await db.get(getUserIdQuery);

    const getLikedUsersQuery = `
    select 
     distinct username
    from 
    (user inner join like on user.user_id = like.user_id) as t 
    inner join tweet on t.tweet_id = tweet.tweet_id 
    where 
    tweet.user_id in 
    (
      select following_user_id 
            from follower where follower_user_id = ${userDetails.user_id}
    ) and 
    tweet.tweet_id = ${tweetId};`;

    const likedUsernames = await db.all(getLikedUsersQuery);

    const userNamesArr = likedUsernames.map((obj) => obj.username);

    if (likedUsernames.length === 0) {
      response.statusCode = 401;
      response.send("Invalid Request");
    } else {
      response.send({ likes: userNamesArr });
    }
  }
);

//api8
app.get(
  "/tweets/:tweetId/replies",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const getUserIdQuery = `
   select * 
    from 
    user 
    where 
    username = '${username}';
  `;

    const userDetails = await db.get(getUserIdQuery);

    const getRepliesUsersQuery = `
    select 
    user.name,
     reply.reply
    from 
    (tweet left join reply on tweet.tweet_id = reply.tweet_id) as t 
    inner join user on t.user_id = user.user_id
    where 
    t.user_id in 
    (
        select 
        following_user_id 
        from follower 
        where follower_user_id = ${userDetails.user_id}
    )and 
    tweet.tweet_id = ${tweetId};
    `;

    const replies = await db.all(getRepliesUsersQuery);

    if (replies.length === 0) {
      response.statusCode = 401;
      response.send("Invalid Request");
    } else {
      response.send({ replies: replies });
    }
  }
);

//api9

app.get("/user/tweets", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserIdQuery = `
   select * 
    from 
    user 
    where 
    username = '${username}';
  `;

  const userDetails = await db.get(getUserIdQuery);

  const getUserTweetsQuery = ` 
    select 
   tweet.tweet,
   count(like.like_id) as likes,
   count(reply.reply_id) as replies,
   tweet.date_time as dateTime
    from
  (  tweet left join like on tweet.tweet_id = like.tweet_id) as t 
  left join reply on t.tweet_id = reply.tweet_id
    where tweet.user_id =  ${userDetails.user_id}
    group by tweet.tweet_id
    ;
    `;

  const userTweets = await db.all(getUserTweetsQuery);
  response.send(userTweets);
});

//api10
app.post("/user/tweets", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;

  const getUserIdQuery = `
  select 
  user_id
  from 
  user 
  where 
  username = '${username}';`;

  const userDetails = await db.get(getUserIdQuery);

  const postTweetQuery = `
  insert 
  into 
  tweet(tweet,user_id)
  values 
  ('${tweet}',${userDetails.user_id});`;

  const postTweetRes = await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

//api11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const getUserIdQuery = `
  select 
  user_id
  from 
  user 
  where 
  username = '${username}';`;

    const userDetails = await db.get(getUserIdQuery);

    const deleteTweetQuery = `
    DELETE FROM
  tweet
WHERE tweet_id = ${tweetId}
and user_id = ${userDetails.user_id};`;
    const deleteTweetRes = await db.run(deleteTweetQuery);
    if (deleteTweetRes.changes === 0) {
      response.statusCode = 401;
      response.send("Invalid Request");
    } else {
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
