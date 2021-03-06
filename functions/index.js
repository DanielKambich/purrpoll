const functions = require("firebase-functions");
const fetch = require("node-fetch");
const catNames = require("cat-names");

const admin = require("firebase-admin");
admin.initializeApp(functions.config().firebase);

var db = admin.firestore();
const cors = require("cors")({ origin: true });

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });

exports.getPairs = functions.https.onRequest(async (request, response) => {
  var numberRef = db.collection("Pairs").doc("number");
  await numberRef.get().then(async function(doc) {
    await numberRef.update({ num: ++doc.data().num });
  });

  let resp = await fetch(
    "https://api.thecatapi.com/v1/images/search?limit=100"
  );
  let catArray = await resp.json();

  let index = 0;
  for (let i = 0; i < catArray.length; i += 2) {

    let catA = catArray[i];
    let catAName = catNames.random();
    await db.collection("Cats").doc(catA["id"]).get().then(async function(doc) {
      if (!doc.exists) {
        let catAJSON = {
          id: catA["id"],
          name: catAName,
          width: catA["width"],
          height: catA["height"],
          image: catA["url"],
          totalVotes: 0
        };
        await db
          .collection("Cats")
          .doc(catA["id"])
          .set(catAJSON);
      }
      else {
        catAName = doc.data().name;
      }
    });

    let catB = catArray[i + 1];
    let catBName = catNames.random();
    await db.collection("Cats").doc(catB["id"]).get().then(async function(doc) {
      if (!doc.exists) {
        let catBJSON = {
          id: catB["id"],
          name: catBName,
          width: catB["width"],
          height: catB["height"],
          image: catB["url"],
          totalVotes: 0
        };
        await db
          .collection("Cats")
          .doc(catB["id"])
          .set(catBJSON);
      }
      else {
        catBName = doc.data().name;
      }
    });

    catAJSON = {
      id: catA["id"],
      name: catAName,
      width: catA["width"],
      height: catA["height"],
      image: catA["url"]
    };
    catBJSON = {
      id: catB["id"],
      name: catBName,
      width: catB["width"],
      height: catB["height"],
      image: catB["url"]
    };
    let pairJSON = {
      catA: catAJSON,
      catB: catBJSON,
      totalVotes: 0,
      votesForCatA: 0,
      votesForCatB: 0,
      index: index + ""
    };
    await db
      .collection("Pairs")
      .doc(index + "")
      .set(pairJSON);

    index++;
  }
  response.send({ status: "success" });
});

function shuffle(array) {
  var m = array.length,
    t,
    i;

  // While there remain elements to shuffle…
  while (m) {
    // Pick a remaining element…
    i = Math.floor(Math.random() * m--);

    // And swap it with the current element.
    t = array[m];
    array[m] = array[i];
    array[i] = t;
  }

  return array;
}

exports.addUser = functions.https.onRequest(async (request, response) => {
  cors(request, response, async () => {
    let uid = request.body.uid;

    if (uid == null) {
      throw new Error("must pass uid in body of request");
    } else {
      let order = [];
      for (let i = 0; i < 50; i++) {
        order.push(i);
      }
      order = await shuffle(order);

      let userJSON = {
        uid: uid,
        catsPicked: [],
        num: 0,
        order: order,
        currentIndex: 0
      };
      db.collection("Users")
        .doc(uid)
        .set(userJSON)
        .then(function() {
          response.send({ status: "success" });
        })
        .catch(function(error) {
          throw new Error(error);
        });
    }
  });
});

exports.getNextCats = functions.https.onRequest(async (request, response) => {
  cors(request, response, async () => {
    let uid = request.body.uid;

    if (uid == null) {
      throw new Error("must pass uid in body of request");
    } else {
      let num;
      let currentIndex;
      await db
        .collection("Users")
        .doc(uid)
        .get()
        .then(function(doc) {
          num = doc.data().num;
          currentIndex = doc.data().currentIndex;
        });
      let currNum;
      await db
        .collection("Pairs")
        .doc("number")
        .get()
        .then(function(doc) {
          currNum = doc.data().num;
        });

      if (currentIndex >= 50 && num == currNum) {
        response.send({
          status: "empty"
        });
      } else {
        if (num != currNum) {
          num = currNum;
          currentIndex = 0;

          await db
            .collection("Users")
            .doc(uid)
            .update({
              num: num,
              currentIndex: currentIndex
            });
        }

        let pairID;
        await db
          .collection("Users")
          .doc(uid)
          .get()
          .then(function(doc) {
            let order = doc.data().order;
            pairID = order[currentIndex];
          });

        let pairJSON = (await db
          .collection("Pairs")
          .doc(pairID + "")
          .get()).data();
        response.send({
          status: "success",
          Pair: pairJSON
        });
      }
    }
  });
});

exports.rateCat = functions.https.onRequest(async (request, response) => {
  cors(request, response, async () => {
    let pairIndex = request.body.pairIndex;
    let catPicked = request.body.catPicked;
    let uid = request.body.uid;

    if (pairIndex == null || catPicked == null || uid == null) {
      throw new Error(
        "must pass pairIndex and catPicked and uid in body of request"
      );
    } else {
      var num;
      await db
        .collection("Users")
        .doc(uid)
        .get()
        .then(function(doc) {
          num = doc.data().num;
        });
      var currNum;
      await db
        .collection("Pairs")
        .doc("number")
        .get()
        .then(function(doc) {
          currNum = doc.data().num;
        });

      if (num != currNum) {
        throw new Error("that pair is out of date");
      }

      var pairJSON;
      await db
        .collection("Pairs")
        .doc(pairIndex)
        .get()
        .then(function(doc) {
          pairJSON = doc.data();
        });

      if (catPicked == "catA") {
        await db
          .collection("Pairs")
          .doc(pairIndex)
          .update({
            totalVotes: ++pairJSON.totalVotes,
            votesForCatA: ++pairJSON.votesForCatA
          });

        let catID = pairJSON["catA"]["id"];
        await db
          .collection("Cats")
          .doc(catID)
          .update({
            totalVotes: admin.firestore.FieldValue.increment(1)
          });

        await db
          .collection("Users")
          .doc(uid)
          .update({
            catsPicked: admin.firestore.FieldValue.arrayUnion(catID),
            currentIndex: admin.firestore.FieldValue.increment(1)
          });
      } else if (catPicked == "catB") {
        await db
          .collection("Pairs")
          .doc(pairIndex)
          .update({
            totalVotes: ++pairJSON.totalVotes,
            votesForCatB: ++pairJSON.votesForCatB
          });

        let catID = pairJSON["catB"]["id"];
        await db
          .collection("Cats")
          .doc(catID)
          .update({
            totalVotes: admin.firestore.FieldValue.increment(1)
          });

        await db
          .collection("Users")
          .doc(uid)
          .update({
            catsPicked: admin.firestore.FieldValue.arrayUnion(catID),
            currentIndex: admin.firestore.FieldValue.increment(1)
          });
      } else {
        throw new Error("must pick either catA or catB");
      }
      response.send({
        status: "success"
      });
    }
  });
});

exports.getUserRatedCats = functions.https.onRequest(async (request, response) => {
  cors(request, response, async () => {
    let uid = request.body.uid;

    if (uid == null) {
      throw new Error("must pass uid in body of request");
    }
    else {
      let catsArr = [];
      let catsPicked;
      await db.collection("Users").doc(uid).get().then(function(doc) {
        catsPicked = doc.data().catsPicked;
      });

      for(let i = 0; i < catsPicked.length; i++) {
        await db.collection("Cats").doc(catsPicked[i]).get().then(function(doc) {
          catsArr.push(doc.data());
        });
      }

      response.send({
        "status":"success",
        "catsPicked":catsArr
      })
    }
  });
});

exports.getTopRatedCats = functions.https.onRequest(async (request, response) => {
  cors(request, response, async () => {
    let catsArr = [];
    await db.collection("Cats").orderBy("totalVotes", "desc").limit(50).get().then(async function(querySnapshot) {
      await querySnapshot.forEach(async function(doc) {
        console.log(doc.data());
        await catsArr.push(doc.data());
      });
    });
    response.send({
      "status":"success",
      "topCats":catsArr
    });
  });
});

exports.deleteUser = functions.https.onRequest((request, response) => {
  cors(request, response, () => {
    let uid = request.body.uid;

    if (uid == null) {
      throw new Error("must pass uid in body of request");
    }
    else {
      db.collection("Users").doc(uid).get().then(function(doc) {
        if (doc.exists) {
          db.collection("Users").doc(uid).delete().then(function() {
            response.send({
              "status":"success"
            });
          });
        }
        else {
          throw new Error("user does not exist");
        }
      });
    }
  });
});
