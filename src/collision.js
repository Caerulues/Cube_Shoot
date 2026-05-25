function getCollisionRect(object) {
    if (object.collisionRect) {
        return object.collisionRect;
    }

    return {
        x: object.x,
        y: object.y,
        width: object.width ?? object.size,
        height: object.height ?? object.size
    };
}

export function checkRectRectCollision(rectA, rectB) {
    const a = getCollisionRect(rectA);
    const b = getCollisionRect(rectB);

    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

export function checkBulletEnemyCollision(bullet, enemy) {
    const enemyRect = getCollisionRect(enemy);

    return (
        bullet.x < enemyRect.x + enemyRect.width &&
        bullet.x + bullet.width > enemyRect.x &&
        bullet.y < enemyRect.y + enemyRect.height &&
        bullet.y + bullet.height > enemyRect.y
    );
}

export function getDistance(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
}
