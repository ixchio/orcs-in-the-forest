sed -i 's/G.player.health -= dmg;/console.log("DAMAGE FROM PROJECTILE. kind: " + p.kind + ", dist: " + p.pos.distanceTo(G.player.pos)); G.player.health -= dmg;/g' src/projectiles.js
