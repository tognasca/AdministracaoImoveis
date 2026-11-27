import {money} from './ui.js';

export const rentalFees = [
  ['condoFee','Condomínio'], ['monthlyIptu','IPTU mensal'], ['water','Água'],
  ['electricity','Energia elétrica'], ['gas','Gás'], ['fireInsurance','Seguro incêndio'],
  ['serviceFee','Taxa de serviço mensal'], ['otherFees','Outras despesas']
];

export function listingPrice(data) {
  const sale = data.price > 0 || !data.rental ? money(data.price) : '';
  const rent = data.rental ? money(data.rental.monthlyRent) + '/mês' : '';
  return [sale,rent].filter(Boolean).join(' · ');
}

export function rentalCosts(rental) {
  const fees = rentalFees.filter(([key]) => rental[key] != null);
  const total = fees.reduce((sum,[key]) => sum + rental[key],rental.monthlyRent);
  return '<p>Aluguel mensal</p><strong>'+money(rental.monthlyRent)+'</strong>' +
    (fees.length ? '<dl>'+fees.map(([key,label]) => '<div><dt>'+label+'</dt><dd>'+money(rental[key])+'</dd></div>').join('')+
      '</dl><p>Total mensal com valores informados</p><strong>'+money(total)+'</strong>' : '');
}
