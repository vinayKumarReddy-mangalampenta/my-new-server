const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const cors = require("cors");
const dbPath = path.join(__dirname, "learningPortal.db");

const app = express();
app.use(express.json());
app.use(cors());
let db = null;

const initializeServerAndDatabase = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(process.env.PORT || 8000, () => {
      console.log("Server running at http://localhost:8000/");
    });
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};

initializeServerAndDatabase();

// register user api
app.get("/", (req, res) => {
  res.send("Hello World!!!");
});
app.post("/register/", async (request, response) => {
  const { username, password, name } = request.body;
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
    if (username === "") {
      response.statusCode = 400;
      response.send({ error_msg: "UserName Can't be empty" });
    } else {
      if (name === "") {
        response.statusCode = 400;
        response.send({ error_msg: "Name Can't be empty" });
      } else {
        if (password.length < 6) {
          response.statusCode = 400;
          response.send({ error_msg: "Password is too short" });
        } else {
          const registerUserQuery = `
  insert into user(name,username,password) 
  values 
  ('${name}','${username}','${hashedPasswd}');`;

          const registerUser = await db.run(registerUserQuery);

          response.statusCode = 200;
          response.send({ token: "User created successfully" });
        }
      }
    }
  } else {
    response.statusCode = 400;
    response.send({ error_msg: "User already exists" });
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
    response.send({ error_msg: "Invalid user" });
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
      response.send({ jwt_token: jwtToken });
    } else {
      response.statusCode = 400;
      response.send({ error_msg: "Invalid Password" });
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

app.post("/userdetails/", async (request, response) => {
  const { jwtToken } = request.body;

  jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
    if (error) {
      response.statusCode = 401;
      response.send({ error_msg: "invalid user" });
    } else {
      const getUserIdQuery = `
   select * 
    from 
    user 
    where 
    username = '${payload.username}';
  `;

      const userDetails = await db.get(getUserIdQuery);

      response.send({
        userId: userDetails.user_id,
        username: userDetails.username,
        name: userDetails.name,
        gender: userDetails.gender,
        userImg: userDetails.user_image,
      });
    }
  });
});

app.get("/tracks/", async (request, response) => {
  const getIdpTracksQuery = `select * from tracks ;`;

  const idpTracks = await db.all(getIdpTracksQuery);

  response.send(
    idpTracks.map((each) => ({
      trackName: each.track_name,
      trackId: each.track_id,
      description: each.description,
      trackImage: each.track_image,
      idpTrack: each.idp_track,
      trackGroup: each.track_group,
    }))
  );
});

app.post("/upload", authenticateToken, async (request, response) => {
  const { userImg, username } = request.body;
  const uploadImageQuery = `
    update user set user_image = '${userImg}' where username = '${username}'`;
  const res = await db.run(uploadImageQuery);

  response.send({ msg: "updated" });
});

app.get("/all/users", async (request, response) => {
  const getUsersListQuery = `select * from user;`;
  const data = await db.all(getUsersListQuery);
  response.send({ data });
}); 

app.get("/phenix/users/messages", async (request, response) => {
  const { user1, user2 } = request.body
  const getUsersListQuery = `select * from phenix_user_messages where user1_id in ("${user1}","${user2}") and user2_id in ("${user1}","${user2}");`;
  const data = await db.get(getUsersListQuery);
  response.send({ data });
});

app.post("/phenix/users/messages", async (request, response) => {
  const { user1, user2,messages_id } = request.body
  const getUsersListQuery = `insert into phenix_user_messages(user1_id,user2_id,messages_id) values("${user1}","${user2}","${messages_id}");`;
  const data = await db.run(getUsersListQuery);
  response.send({ data });
});

module.exports = app;
