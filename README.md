# bms-bot
A bot to automate ticket booking on BookMyShow. This can be helpful to book tickets for a hyped movie a day before when tickets are opened in smaller quantities.

### How to run

Configure the fields according to your choice by creating a new file called `config.json`. You can refer to `config.example.json`.

Make sure you have the `chromedriver` executable in the root directory of the project. You can find `chromedriver` at [Chrome Drivers](http://chromedriver.storage.googleapis.com/index.html).

Run `yarn install` in the root directory of the project.

Run `yarn start` to run the script.

##Caution
Just check whether the current version of chrome driver is installed and is present in package.json.
If not,
Run npm i chromedriver
