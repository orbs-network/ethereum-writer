function format(msg?: string): string {
    return `${new Date().toISOString()} ${msg}`;
}

export default class Logger {

    static log(msg?: string) {
        console.log(format(msg));
    }

    static error(msg?: string) {
        console.error('[ERROR]', format(msg));
    }

}
