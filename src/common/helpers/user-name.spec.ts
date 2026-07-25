import { getFullName, namesMatchLoose, withDisplayName } from './user-name';

describe('getFullName', () => {
  it('joins first, middle, and last', () => {
    expect(
      getFullName({
        firstName: 'Chibuzor',
        middleName: 'Ifeanyi',
        lastName: 'Okafor',
      }),
    ).toBe('Chibuzor Ifeanyi Okafor');
  });

  it('skips empty middle name', () => {
    expect(
      getFullName({ firstName: 'Ada', middleName: null, lastName: 'Lovelace' }),
    ).toBe('Ada Lovelace');
  });
});

describe('withDisplayName', () => {
  it('adds a name field', () => {
    expect(
      withDisplayName({ id: '1', firstName: 'Ada', lastName: 'Lovelace' }),
    ).toEqual({
      id: '1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      name: 'Ada Lovelace',
    });
  });
});

describe('namesMatchLoose', () => {
  it('matches when order differs', () => {
    expect(namesMatchLoose('OKAFOR CHIBUZOR', 'Chibuzor', 'Okafor')).toBe(true);
  });

  it('matches when bank includes a middle name', () => {
    expect(
      namesMatchLoose('CHIBUZOR IFEANYI OKAFOR', 'Chibuzor', 'Okafor'),
    ).toBe(true);
  });

  it('fails when a required token is missing', () => {
    expect(namesMatchLoose('CHIBUZOR ONLY', 'Chibuzor', 'Okafor')).toBe(false);
  });
});
