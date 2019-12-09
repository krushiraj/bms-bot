link pattern = in.bookmyshow.com/{location[hyderabad/banglore/delhi]}/{type[movies/show/concert]}/{lang[telugu/hindi]}

location, movie name, language, format should be similar to one provided in bms
Theatre name should not contain any punctuation marks

#btnPopupAccept

#pop\_{num}

Empty seats will have id attribute where as occupied won't have any id

all together? if no what can be max split? x no of seats together

exclude rows? alphabet or top or bottom - left and right padding

select m ticket or box office pick up

click id="prePay", enter email and mobile number and click continue "dContinueContactSec"

payment type credit/debit/upi - dTUPI/dTDCC

card
txtCardNo
txtCardName
txtExpMonth
txtExpYear
txtCVV

UPI
txtMobileId

Have better generic model for scraping/crawling. Use some generic functions and a config file to map to different elements and actions.
Use CSS/XPath selectors collection stored in a config file for easy updates.
Use a logger to log if there are any issues or to find if a scrapper is outdated because of UI changes or website revamps on the provider sites.
Take a screenshot and tag it in the log whenever there is an issue.
Try using puppeteer instead of selenium. It can provide a head less version of chrome and even allows to take screenshots of how the dom looks when rendered.
Make a POC using puppeteer and see if we can use to full extent to build this bot.