const basePalette = {
  background:            'rgb(9, 9, 20)',
  card:                  'rgba(14, 14, 28, 1)',
  elevated:              'rgba(19, 19, 42, 1)',
  border:                'rgba(30, 30, 56, 1)',

  text:                  'rgba(238, 238, 248, 1)',
  mutedText:             'rgba(102, 102, 122, 1)',
  dimText:               'rgba(46, 46, 72, 1)',

  tint:                  'rgba(217, 68, 68, 1)',
  tabIconDefault:        'rgba(68, 68, 90, 1)',
  tabIconSelected:       'rgba(238, 238, 248, 1)',

  buttonPrimaryBg:       'rgba(255, 255, 255, 1)',
  buttonPrimaryText:     'rgba(17, 17, 32, 1)',
  buttonSecondaryBg:     'rgba(19, 19, 42, 1)',
  buttonSecondaryText:   'rgba(160, 160, 192, 1)',
  buttonSecondaryBorder: 'rgba(30, 30, 56, 1)',

  playerRed:             'rgba(217, 68, 68, 1)',
  playerBlue:            'rgba(59, 125, 216, 1)',
  playerGreen:           'rgba(45, 170, 92, 1)',
  playerYellow:          'rgba(232, 165, 32, 1)',

  success:               'rgba(45, 170, 92, 1)',
  warning:               'rgba(232, 165, 32, 1)',
  info:                  'rgba(59, 125, 216, 1)',
  danger:                'rgba(217, 68, 68, 1)',
};

export default {
  light: { ...basePalette },
  dark:  { ...basePalette },
};