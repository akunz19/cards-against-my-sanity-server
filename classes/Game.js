const Firebase = require('./Firebase');
const Player = require('./Player');
const { generateNewGameBody, getCardById, shuffle } = require('../utils');

class Game extends Firebase {
  constructor(data, db, ref) {
    super(data, db, ref);
  }

  drawWhiteCard(discardedCard = null) {
    return this._drawCard('white', discardedCard);
  }

  _drawCard(deck, currentCard = null) {
    // Reshuffle if at end of deck
    if (!this.decks[deck] || this.decks[deck].length === 0) {
      const shuffledDeck = shuffle(this.discard[deck]);
      this.decks[deck] = shuffledDeck;
      this.discard[deck] = [];
    }

    // Add old card to discard pile if current card exists
    if (currentCard) {
      // Add to discard pile if exists
      if (this.discard && this.discard[deck]) {
        this.discard[deck].push(currentCard);
      } else {
        // Create discard pile for deck if it does not exist
        this.discard = {
          ...this.discard,
          [deck]: [currentCard],
        };
      }
    }

    return this.decks[deck].pop();
  }

  drawBlackCard() {
    const blackCard = this._drawCard('black', this.blackCard.id);
    this.blackCard = getCardById(blackCard);
  }

  generateHand() {
    return Array.apply(null, Array(7)).map(() => getCardById(this.drawWhiteCard()));
  }

  addPlayer(playerId, name, isVIP) {
    if (!this.players) this.players = {};
    this.players[playerId] = {
      name,
      isVIP,
      isCardzar: false,
      submittedCard: false,
      lastUpdated: new Date().toISOString(),
    };
  }

  recordCardSubmit(playerId) {
    this.players[playerId].submittedCard = true;
  }

  isRoundReady() {
    return Object.keys(this.players).every(
      (p) => this.players[p].submittedCard || this.players[p].isCardzar
    );
  }

  setRandomCardzar() {
    const playerKeys = Object.keys(this.players);
    const randomCardzarIndex = Math.floor(Math.random() * playerKeys.length);
    const cardzarPlayerId = playerKeys[randomCardzarIndex];
    this.players[cardzarPlayerId].isCardzar = true;
  }

  async getAllPlayers() {
    const playerIds = Object.keys(this.players);
    return await Promise.all(
      playerIds.map(async (pid) => {
        const snapshot = await this._db.ref(`players/${pid}`).once('value');
        return new Player(
          {
            ...snapshot.val(),
            playerId: pid,
          },
          this._db,
          `players/${pid}`
        );
      })
    );
  }

  async getAllPlayersCards() {
    const players = await this.getAllPlayers();

    return players.filter((p) => !this.players[p.playerId].isCardzar).map((p) => p.submittedCard);
  }

  updatePlayerTime(playerId) {
    this.players[playerId].lastUpdated = new Date().toISOString();
  }

  calculatePlayerScore(playerId) {
    return Object.values(this.roundWinners || {}).filter((winner) => winner === playerId).length;
  }

  async recordRoundWinner(cardId) {
    const players = await this.getAllPlayers();
    const winner = players.find((p) => p.submittedCard && p.submittedCard.id === cardId);

    if (!this.roundWinners) this.roundWinners = {};
    this.roundWinners[this.blackCard.id] = winner.playerId;

    this.round.winner = {
      ...this.players[winner.playerId],
      id: winner.playerId,
    };
    this.round.winningCard = winner.submittedCard;
    this.round.isComplete = true;

    if (parseInt(this.winner.winningScore) === this.calculatePlayerScore(winner.playerId)) {
      this.winner.winner = winner.dbVals();
      this.gameOver = true;
    }
  }

  resetRound() {
    this.round = {
      ready: false,
      cards: [],
      winner: {},
      winningCard: {},
      isComplete: false,
    };

    const playerIds = Object.keys(this.players);
    playerIds.forEach((pid) => {
      this.players[pid].submittedCard = false;
    });
  }

  setNextCardzar() {
    const playerIds = Object.keys(this.players);
    const currentCardzarId = playerIds.find((pid) => this.players[pid].isCardzar);
    const currentCardzarIndex = playerIds.indexOf(currentCardzarId);

    this.players[currentCardzarId].isCardzar = false;

    const nextCardzarIndex =
      currentCardzarIndex >= playerIds.length - 1 ? 0 : currentCardzarIndex + 1;
    const cardzarId = playerIds[nextCardzarIndex];

    this.players[cardzarId].isCardzar = true;
  }

  resetGame() {
    const playerIds = Object.keys(this.players);

    playerIds.forEach((pid) => {
      this.players[pid].isCardzar = false;
      this.players[pid].submittedCard = false;
      this.players[pid].lastUpdated = new Date();
    });

    const resetBody = generateNewGameBody(this.expansion, this.winner.winningScore, true);
    Object.keys(resetBody).forEach((key) => {
      this[key] = resetBody[key];
    });
  }
}

module.exports = Game;
