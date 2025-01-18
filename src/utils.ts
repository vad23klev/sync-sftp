export function match(item: string, ignorePatterns: string[]) {
    let matches = false;
    for (const element of ignorePatterns) {
        const res = item.match(element);
        if (res) {
            matches = true;
            break;
        }
    }
    return matches
}
export function timeString () {
    const now = new Date();
    const minutes = '0' + now.getMinutes();
    return '[' + now.getHours() + ':' + minutes.slice(-2) + ']: ';
}