export default {
  convertTextToWorkMode(text: string) {
    switch (text) {
      case '个人模式':
        return 'personal';
      case '群组模式':
        return 'group';
      default:
        return '';
    }
  }
};
