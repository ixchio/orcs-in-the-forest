sed -i 's/G.player.health -= dmg;/console.log("DAMAGE FROM ENEMY CONTACT. enemy type: " + enemy.type + ", dist: " + dist); G.player.health -= dmg;/g' src/enemies.js
