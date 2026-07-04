const basePalette = {
  /** Screens use LudoBackground — keep transparent so gradient shows through. */
  background:            'transparent',
  card:                  'rgba(255, 255, 255, 0.12)',
  elevated:              'rgba(28, 20, 58, 0.55)',
  border:                'rgba(255, 255, 255, 0.14)',

  text:                  'rgba(255, 255, 255, 0.96)',
  mutedText:             'rgba(255, 255, 255, 0.58)',
  dimText:               'rgba(255, 255, 255, 0.32)',

  tint:                  'rgba(224, 72, 72, 1)',
  tabIconDefault:        'rgba(255, 255, 255, 0.38)',
  tabIconSelected:       'rgba(255, 255, 255, 0.96)',

  buttonPrimaryBg:       'rgba(255, 255, 255, 0.95)',
  buttonPrimaryText:     'rgba(26, 17, 80, 1)',
  buttonSecondaryBg:     'rgba(255, 255, 255, 0.10)',
  buttonSecondaryText:   'rgba(255, 255, 255, 0.88)',
  buttonSecondaryBorder: 'rgba(255, 255, 255, 0.20)',

  playerRed:             'rgba(224, 72, 72, 1)',
  playerBlue:            'rgba(68, 136, 232, 1)',
  playerGreen:           'rgba(55, 189, 106, 1)',
  playerYellow:          'rgba(240, 181, 48, 1)',

  success:               'rgba(55, 189, 106, 1)',
  warning:               'rgba(240, 181, 48, 1)',
  info:                  'rgba(68, 136, 232, 1)',
  danger:                'rgba(224, 72, 72, 1)',

  /** Frosted tab bar / overlays on gradient */
  glass:                 'rgba(255, 255, 255, 0.10)',
  glassBorder:           'rgba(255, 255, 255, 0.14)',
};

export default {
  light: { ...basePalette },
  dark:  { ...basePalette },
};
