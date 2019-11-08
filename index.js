const { Builder, By, Key, until } = require("selenium-webdriver");
const fs = require("fs");

const {
  location,
  type,
  name,
  lang,
  format,
  theatres,
  timerange,
  people,
  rows,
  sendEmail: { user, pass }
} = JSON.parse(fs.readFileSync("config.json").toString());

let booked = false;

async function sendEmail(time, availability) {
  const send = require("gmail-send")({
    user,
    pass,
    to: [
      "krushiraj123@hotmail.com"
      // "mahendrapamidi96@gmail.com",
      // "sairamnuguri23@gmail.com",
      // "sachith.1197@gmail.com",
      // "saikrishnadosapati@gmail.com",
      // "kushalthallapally123@gmail.com",
      // "sai.sameer.reddy@gmail.com",
      // "gsaatvik@gmail.com"
    ],
    text: `${name} tickets available in ${theatres[0]} for ${time} show. 
    There are ${availability} tickets avaialable in total, excluding the top most and bottom 4 rows. 
    Please hurry up, help yourself or ping Krushi ASAP to ask him to proceed further.`,
    files: ["out.png"]
  });

  send(
    {
      subject: `Alert - ${name} Tickets available at ${
        theatres[0]
      } for time:${time} show`
    },
    async function(err, res, full) {
      if (err) return console.log(err);
      console.log("res:", res);
      console.log("full:", full);
    }
  );
}

async function example() {
  let driver = await new Builder().forBrowser("chrome").build();
  try {
    driver
      .manage()
      .window()
      .maximize();
    console.log(
      `Read the configuration file. Now I'm trying to book tickets for ${name} in ${
        theatres[0]
      }, ${location}.`
    );
    await driver.get(`https://in.bookmyshow.com/${location}/${type}/`);
    let link = await driver.findElement(
      By.xpath(
        `//*[@data-search-filter='movies-${name.replace(/\s/g, "-")}']/a`
      )
    );
    console.log(`Got the link for movie.`);
    await driver.get((await link.getAttribute("href")).toString());
    await driver.wait(until.titleContains(name), 10000);
    await driver
      .findElement(By.className("wzrk-overlay"))
      .then(overlay => {
        if (overlay) {
          driver.findElement(By.id("wzrk-confirm")).click();
        }
      })
      .catch(console.error);
    console.log(`Clicking on Book Tickets button.`);
    await driver
      .findElement(By.className("showtimes btn"))
      .click()
      .catch(err => console.error(err));
    console.log(`Selecting ${lang} language and ${format} format.`);
    let url,
      formatOptions = await driver.findElements(
        By.css(`#lang-${lang} > .format-dimensions > a`)
      );
    const formatModal =
      (await driver.getCurrentUrl()).toString().search("buytickets") == -1;
    if (formatModal) {
      for (let index in formatOptions) {
        if ((await formatOptions[index].getText()) === format) {
          url = (await formatOptions[index].getAttribute("href")).toString();
          console.log(url);
          await driver.get(url);
          await driver.wait(
            until.titleContains(`${name} Movie, Showtimes in ${location}`),
            10000
          );
          break;
        }
      }
    }
    console.log(`Searching for theatre - ${theatres[0]}`);
    driver
      .findElement(By.className("wzrk-overlay"))
      .then(overlay => {
        if (overlay) {
          driver.findElement(By.id("wzrk-confirm")).click();
        }
      })
      .catch(console.error);
    await driver.findElement(By.className("__search")).click();
    await driver.findElement(By.id("fltrsearch")).sendKeys(theatres[0]);
    let showTimes = await driver.findElements(
      By.css("#venuelist > li:not(._none) > .body > div:not(._soldout) > a")
    );
    for (let index in showTimes) {
      let { start, end } = timerange;
      const time = (await showTimes[index].getAttribute(
        "data-showtime-code"
      )).toString();
      if (time <= end && time >= start) {
        await showTimes[index].click();
        await driver.wait(function() {
          return driver.findElement(By.css("a#btnPopupAccept")).isDisplayed();
        }, 10000);
        console.log(`Clicking on accept button for terms and conditions.`);
        await driver.findElement(By.css("a#btnPopupAccept")).click();
        console.log(`Waiting for seat layout to be loaded.`);
        await driver.wait(until.urlContains("#!seatlayout"));
        await driver.wait(function() {
          return driver.findElement(By.id("layout")).isDisplayed();
        }, 10000);
        await driver.wait(until.elementLocated(By.id("layout"), 10000));
        console.log(`Seat layout recieved.`);
        await driver.findElement(By.id(`pop_${people}`)).click();
        await driver.findElement(By.id("proceed-Qty")).click();
        console.log(`Selected seat requirement as ${people} people.`);

        console.log(`Checking for available seats and counting.`);
        let availableSeatsList = await driver.findElements(
          By.css("#layout tbody .SRow1 a._available")
        );
        let availableSeats = [],
          { start, end } = rows;
        for (let index in availableSeatsList) {
          const seatId = (await availableSeatsList[index]
            .findElement(By.xpath(".."))
            .getAttribute("id")).toString();
          const [type, row, seat] = seatId.split("_");
          if (Number(row) <= Number(end) && Number(row) >= Number(start)) {
            await availableSeats.push({ type, row, seat });
          }
        }

        if (availableSeats.length >= people) {
          await driver.takeScreenshot().then(function(image, err) {
            require("fs").writeFile("out.png", image, "base64", function(err) {
              console.log(err);
            });
          });
          await sendEmail(time, availableSeats.length);
          const readline = require("readline");

          function askQuestion(query) {
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout
            });

            return new Promise(resolve =>
              rl.question(query, ans => {
                rl.close();
                resolve(ans);
              })
            );
          }

          const ans = await askQuestion(
            "Are you sure you want to deploy to PRODUCTION? "
          );
        }

        // for (let i = start; i >= end; i++) {
        //   let selected = false;
        //   let currentRowSeats = availableSeats.filter(({ row }) => i == row);
        //   currentRowSeats.sort((a, b) => a.seat > b.seat);
        //   let positions = [];
        //   for (let j in currentRowSeats) {
        //     if (
        //       currentRowSeats[j + people].seat ==
        //       currentRowSeats[j].seat + people
        //     ) {
        //       positions.push(currentRowSeats[j]);
        //     }
        //   }
        //   for (let j in positions) {

        //   }
        //   if (selected) break;
        // }
      }
    }
  } finally {
    await driver.quit();
    setTimeout(example, 10000);
  }
}

example();
