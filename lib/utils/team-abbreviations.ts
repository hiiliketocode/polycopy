// Helper function to abbreviate team names
export function abbreviateTeamName(teamName: string): string {
  // Convert to uppercase for consistency
  const name = teamName.toUpperCase().trim();
  
  // NFL abbreviations
  const nflAbbreviations: Record<string, string> = {
    'CHIEFS': 'KC',
    'KANSAS CITY': 'KC',
    'RAIDERS': 'LV',
    'LAS VEGAS': 'LV',
    'CHARGERS': 'LAC',
    'BRONCOS': 'DEN',
    'COWBOYS': 'DAL',
    'GIANTS': 'NYG',
    'EAGLES': 'PHI',
    'COMMANDERS': 'WAS',
    'WASHINGTON': 'WAS',
    'BEARS': 'CHI',
    'LIONS': 'DET',
    'PACKERS': 'GB',
    'VIKINGS': 'MIN',
    'FALCONS': 'ATL',
    'PANTHERS': 'CAR',
    'SAINTS': 'NO',
    'BUCCANEERS': 'TB',
    'CARDINALS': 'ARI',
    'RAMS': 'LAR',
    'SEAHAWKS': 'SEA',
    '49ERS': 'SF',
    'NINERS': 'SF',
    'BILLS': 'BUF',
    'DOLPHINS': 'MIA',
    'PATRIOTS': 'NE',
    'JETS': 'NYJ',
    'RAVENS': 'BAL',
    'BENGALS': 'CIN',
    'BROWNS': 'CLE',
    'STEELERS': 'PIT',
    'TEXANS': 'HOU',
    'COLTS': 'IND',
    'JAGUARS': 'JAX',
    'TITANS': 'TEN',
  };
  
  // NHL abbreviations
  const nhlAbbreviations: Record<string, string> = {
    'BRUINS': 'BOS',
    'CANADIENS': 'MTL',
    'MAPLE LEAFS': 'TOR',
    'SENATORS': 'OTT',
    'PENGUINS': 'PIT',
    'FLYERS': 'PHI',
    'RANGERS': 'NYR',
    'ISLANDERS': 'NYI',
    'DEVILS': 'NJD',
    'BLACKHAWKS': 'CHI',
    'RED WINGS': 'DET',
    'PREDATORS': 'NSH',
    'BLUES': 'STL',
    'WILD': 'MIN',
    'AVALANCHE': 'COL',
    'STARS': 'DAL',
    'JETS': 'WPG',
    'OILERS': 'EDM',
    'FLAMES': 'CGY',
    'CANUCKS': 'VAN',
    'GOLDEN KNIGHTS': 'VGK',
    'KRAKEN': 'SEA',
    'LIGHTNING': 'TBL',
    'PANTHERS': 'FLA',
    'HURRICANES': 'CAR',
    'CAPITALS': 'WSH',
    'BLUE JACKETS': 'CBJ',
    'DUCKS': 'ANA',
    'SHARKS': 'SJS',
    'KINGS': 'LAK',
  };
  
  // NBA abbreviations
  const nbaAbbreviations: Record<string, string> = {
    'LAKERS': 'LAL',
    'CLIPPERS': 'LAC',
    'WARRIORS': 'GSW',
    'KINGS': 'SAC',
    'SUNS': 'PHX',
    'MAVERICKS': 'DAL',
    'ROCKETS': 'HOU',
    'SPURS': 'SAS',
    'NUGGETS': 'DEN',
    'JAZZ': 'UTA',
    'THUNDER': 'OKC',
    'TIMBERWOLVES': 'MIN',
    'TRAIL BLAZERS': 'POR',
    'GRIZZLIES': 'MEM',
    'PELICANS': 'NOP',
    'HEAT': 'MIA',
    'MAGIC': 'ORL',
    'HAWKS': 'ATL',
    'HORNETS': 'CHA',
    'WIZARDS': 'WAS',
    'CELTICS': 'BOS',
    'NETS': 'BKN',
    '76ERS': 'PHI',
    'KNICKS': 'NYK',
    'RAPTORS': 'TOR',
    'BUCKS': 'MIL',
    'BULLS': 'CHI',
    'CAVALIERS': 'CLE',
    'PISTONS': 'DET',
    'PACERS': 'IND',
  };
  
  // MLB abbreviations
  const mlbAbbreviations: Record<string, string> = {
    'YANKEES': 'NYY',
    'RED SOX': 'BOS',
    'DODGERS': 'LAD',
    'GIANTS': 'SF',
    'CUBS': 'CHC',
    'CARDINALS': 'STL',
    'ASTROS': 'HOU',
    'BRAVES': 'ATL',
    'METS': 'NYM',
    'PHILLIES': 'PHI',
    'PADRES': 'SD',
    'MARINERS': 'SEA',
    'RANGERS': 'TEX',
    'ANGELS': 'LAA',
    'ATHLETICS': 'OAK',
    'RAYS': 'TB',
    'TIGERS': 'DET',
    'TWINS': 'MIN',
    'GUARDIANS': 'CLE',
    'ROYALS': 'KC',
    'WHITE SOX': 'CWS',
    'MARLINS': 'MIA',
    'NATIONALS': 'WSH',
    'ORIOLES': 'BAL',
    'BLUE JAYS': 'TOR',
    'DIAMONDBACKS': 'ARI',
    'ROCKIES': 'COL',
    'PIRATES': 'PIT',
    'REDS': 'CIN',
    'BREWERS': 'MIL',
  };
  
  // Combine all abbreviations
  const allAbbreviations = {
    ...nflAbbreviations,
    ...nhlAbbreviations,
    ...nbaAbbreviations,
    ...mlbAbbreviations,
  };
  
  // Check for exact match first
  if (allAbbreviations[name]) {
    return allAbbreviations[name];
  }
  
  // Check if name contains any of the keys
  for (const [fullName, abbrev] of Object.entries(allAbbreviations)) {
    if (name.includes(fullName)) {
      return abbrev;
    }
  }
  
  // If no match, return first 3 letters uppercase
  return name.slice(0, 3);
}

