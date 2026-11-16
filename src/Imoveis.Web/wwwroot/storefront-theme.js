export function storefrontTheme({color, colorOpacity, textColor}) {
  const source = /^#[0-9a-f]{6}$/i.test(color) ? color : '#6B5140';
  const opacity = (Number.isInteger(colorOpacity) && colorOpacity >= 0 && colorOpacity <= 100 ? colorOpacity : 100) / 100;
  const paper = [246,243,235];
  const rgb = source.slice(1).match(/../g).map((value,index) =>
    Math.round(parseInt(value, 16) * opacity + paper[index] * (1 - opacity)));
  const background = '#' + rgb.map(value => value.toString(16).padStart(2,'0')).join('');
  const channels = rgb.map(value => {
    const channel = value / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  const luminance = .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  const blackContrast = (luminance + .05) / .05;
  const whiteContrast = 1.05 / (luminance + .05);
  let darkText = blackContrast >= whiteContrast;
  if (textColor === 'black' && blackContrast >= 4.5) darkText = true;
  if (textColor === 'white' && whiteContrast >= 4.5) darkText = false;
  return {background, foreground:darkText ? '#000' : '#fff', shade:darkText ? '#fff' : '#000'};
}
