// Money Moves: short lessons with one question each. Written fresh for Nest Egg.
// Each lesson can be finished once per kid; finishing all of them earns a badge.
const LESSONS = [
  {
    id: 'jars', emoji: '🫙', title: 'Three jars, three jobs',
    body: [
      'Every dollar you get has a job. In Nest Egg it goes into one of three jars.',
      '<b>Spend</b> is for things you want soon, like a snack or a game. <b>Save</b> is for bigger things later, and it earns interest. <b>Give</b> is for helping someone else: a food shelf, a friend, an animal shelter.',
      'Grown-ups do the same thing with different names: a checking account, a savings account and charity. Splitting money up <i>before</i> you spend it is the whole trick. It\'s much easier than trying to save whatever is left over.',
    ],
    q: 'Grandma gives you $20. When is the best time to decide how much goes into Save?',
    choices: ['After I buy what I want', 'Right away, before I spend any', 'At the end of the year'],
    a: 1, why: 'Decide first. Money left "for later" has a way of disappearing.',
  },
  {
    id: 'needs', emoji: '🥪', title: 'Needs and wants',
    body: [
      'A <b>need</b> is something you can\'t do without: food, a warm coat in a Minnesota January, a place to sleep. A <b>want</b> is something nice to have: a new video game, the fancy coat instead of the plain one.',
      'Wants aren\'t bad. Life would be boring without them! But needs come first, and knowing the difference helps you decide when money is tight.',
      'A good test: "What happens if I don\'t buy this?" If the answer is "I\'d be cold" or "I\'d be hungry," it\'s a need. If the answer is "I\'d be a little sad," it\'s a want.',
    ],
    q: 'Which one is a need?',
    choices: ['Winter boots that fit', 'A second pair of winter boots in a cooler color', 'A sticker for your boots'],
    a: 0, why: 'Boots that fit keep your feet warm and dry. The rest are wants, and that\'s fine, they just come second.',
  },
  {
    id: 'interest', emoji: '🌱', title: 'Interest: money that grows',
    body: [
      'When you keep money in a bank, the bank pays you a little extra for letting it hold your money. That extra is called <b>interest</b>.',
      'In Nest Egg, your parents are the bank. Money in your Save jar earns interest, and it shows up by itself.',
      'Here\'s the cool part: next time, you earn interest on your interest too. That\'s called <b>compound interest</b>. It starts slow, like a snowball at the top of a hill, and gets bigger and faster the longer it rolls.',
    ],
    q: 'You have $100 that earns 10% a year. After two years, about how much do you have?',
    choices: ['$120', '$121', '$200'],
    a: 1, why: 'Year one: $100 + $10 = $110. Year two: $110 + $11 = $121. That extra dollar is interest on your interest.',
  },
  {
    id: 'patience', emoji: '⏳', title: 'The waiting game',
    body: [
      'In the 1960s and 70s, scientists at Stanford tried a famous experiment. They offered kids one marshmallow right now, or two if they could wait about 15 minutes alone in a room with the first one.',
      'Some kids ate it right away. Others sang songs, covered their eyes, or turned their chairs around to help themselves wait. Later studies found that a kid\'s surroundings matter a lot too: kids wait more when they trust the grown-up will really keep the promise.',
      'That\'s the deal with your Save jar. Nest Egg pays interest on the <b>lowest</b> amount in Save during each period, so taking money out costs you interest. Waiting really does pay, and your parents promise to keep the deal.',
    ],
    q: 'Interest is paid on the lowest Save balance in the period. You have $50, take out $30 on day 3, and put it back on day 20. What gets interest?',
    choices: ['$50', '$20', '$80'],
    a: 1, why: 'For part of the period you only had $20, so only $20 earns interest. Leaving it alone would have earned interest on all $50.',
  },
  {
    id: 'seventytwo', emoji: '🔢', title: 'The Rule of 72',
    body: [
      'Want to know how long it takes your money to double? There\'s a shortcut that bankers have used for hundreds of years.',
      'Divide <b>72</b> by the interest rate. At 6% a year, money doubles in about 72 ÷ 6 = <b>12 years</b>. At 9%, about 8 years. At 2%, about 36 years.',
      'It also works backwards for things that shrink your money, like prices going up. Try it on the Grow tab: move the rate slider and watch how fast the line curves up.',
    ],
    q: 'At 8% a year, about how long until $50 becomes $100?',
    choices: ['About 4 years', 'About 9 years', 'About 20 years'],
    a: 1, why: '72 ÷ 8 = 9 years.',
  },
  {
    id: 'cost', emoji: '⚖️', title: 'Everything costs something else',
    body: [
      'When you choose one thing, you give up the next best thing. Economists call that the <b>opportunity cost</b>.',
      'If you spend $15 on candy, the cost isn\'t just $15. It\'s also the $15 that won\'t go toward the bike you\'re saving for, and all the interest it would have earned.',
      'This doesn\'t mean you should never buy candy! It means asking "what am I giving up?" before you buy. Sometimes the candy wins, and that\'s okay.',
    ],
    q: 'Sam can go to a movie ($12) or put $12 toward a new skateboard. What\'s the opportunity cost of the movie?',
    choices: ['$0, because movies are fun', 'Getting $12 closer to the skateboard', 'The popcorn'],
    a: 1, why: 'The next best choice is what you give up. Here that\'s progress on the skateboard.',
  },
  {
    id: 'giving', emoji: '💜', title: 'Why we give',
    body: [
      'Almost every family, faith and culture has a tradition of sharing part of what you have. It\'s one of the oldest money rules there is.',
      'Giving helps the people who get it, but it also helps the giver. Studies have found that people who spend a little on others often feel happier than people who spend the same amount on themselves.',
      'Your Give jar doesn\'t have to be big. A few dollars for a food shelf, a toy for a donation drive, or saving up to sponsor something together as a family all count. You choose where it goes.',
    ],
    q: 'What\'s a good way to use your Give jar?',
    choices: ['Buying myself a treat', 'Donating to a cause I care about', 'Hiding it so nobody knows'],
    a: 1, why: 'Give money is for others. Picking a cause you care about makes it even better.',
  },
  {
    id: 'inflation', emoji: '🎈', title: 'Why prices go up',
    body: [
      'A candy bar cost about a nickel in 1950. Today it\'s well over a dollar. The candy didn\'t get 25 times better. Prices just slowly creep up over time. That\'s called <b>inflation</b>.',
      'Inflation means a dollar under your mattress buys a little less every year. That\'s one big reason people put money where it can grow, like a savings account or investments.',
      'If your money grows faster than prices go up, you\'re getting ahead. If it grows slower, you\'re falling behind even though the number looks the same.',
    ],
    q: 'Prices go up 3% this year. Your savings earn 1%. Are you getting ahead?',
    choices: ['Yes, I have more dollars', 'No, my money buys a little less than before', 'It doesn\'t matter'],
    a: 1, why: 'You have more dollars, but each one buys less. Your money needs to grow faster than prices to really get ahead.',
  },
  {
    id: 'stocks', emoji: '🏭', title: 'Owning a piece of a company',
    body: [
      'Banks aren\'t the only place money can grow. You can also buy a <b>share</b> of a company: a tiny slice of the business. If the company does well, your slice can become worth more.',
      'Over long stretches, owning lots of companies together has grown faster than a savings account. But it\'s bumpy. Some years go down a lot, and nobody can promise what happens next.',
      'That\'s why grown-ups keep money they need soon somewhere safe, and only invest money they can leave alone for many years. Patience again!',
    ],
    q: 'Which money is best to invest in stocks?',
    choices: ['Money for lunch tomorrow', 'Money I won\'t need for 10 years or more', 'Money for a birthday gift next week'],
    a: 1, why: 'Stocks can drop in the short run. Time gives them a chance to recover and grow.',
  },
  {
    id: 'scams', emoji: '🚩', title: 'Too good to be true',
    body: [
      'Some people try to trick others out of their money. Online, it might be a message saying you won a prize, or a game that promises free coins if you type in a parent\'s card number or password.',
      'Here\'s the rule that catches almost all of them: <b>if it sounds too good to be true, it probably is.</b> Nobody hands out free money to strangers.',
      'Never share passwords, card numbers or codes with anyone online, even if they say they\'re from the game company. Tell a grown-up instead. You won\'t be in trouble for asking.',
    ],
    q: 'A message says "You won 10,000 free gems! Just enter your mom\'s card number to claim." What do you do?',
    choices: ['Enter it quickly before the prize expires', 'Close it and tell a grown-up', 'Ask a friend for their card number instead'],
    a: 1, why: 'That\'s a scam. Real prizes never need a card number, and a grown-up can help you report it.',
  },
  {
    id: 'debt', emoji: '🧾', title: 'Borrowing costs extra',
    body: [
      'Interest works the other way too. When you <b>borrow</b> money, you pay interest to the lender. A credit card is a kind of borrowing.',
      'If someone borrows $1,000 on a card that charges 24% a year and pays only a little each month, they can end up paying hundreds of dollars extra, and it takes years to pay off.',
      'Earning interest is like having a helper working for you. Paying interest is like working for someone else. Savers get the helper.',
    ],
    q: 'Who gets the interest when you borrow money?',
    choices: ['You do', 'The lender does', 'Nobody'],
    a: 1, why: 'The borrower pays and the lender earns. That\'s why saving first and buying later usually costs less.',
  },
  {
    id: 'goals', emoji: '🎯', title: 'Making a goal real',
    body: [
      '"I want to save money" is a wish. "I\'m saving $60 for a new soccer ball by June" is a <b>goal</b>. Goals have a what, a how much and a when.',
      'Break it into small steps. $60 in 20 weeks is $3 a week, which is a lot less scary than $60.',
      'Add your goal in Nest Egg and it will tell you when you\'ll get there. Watch what happens to that date when you skip one treat. Small choices add up faster than you\'d think.',
    ],
    q: 'Which one is a real goal?',
    choices: ['I want lots of money', 'Save $40 for a LEGO set by my birthday in March', 'Maybe buy something someday'],
    a: 1, why: 'It says what, how much and when, so you can make a plan.',
  },
];
