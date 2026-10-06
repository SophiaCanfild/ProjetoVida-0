# 📘 TCC do Vida+ — como está organizado e o que falta

Esta pasta guarda o **documento do TCC** do sistema Vida+ e as ferramentas que
geram o arquivo `.docx` já formatado conforme as normas ABNT.

| Arquivo | Para que serve |
|:---|:---|
| `TCC-Vida+.md` | **Fonte do texto.** É aqui que escrevemos o conteúdo, por partes. |
| `TCC-Vida+.docx` | Documento final formatado (gerado a partir do `.md`). |
| `gerar-docx.py` | Programa que converte o `.md` no `.docx` com a formatação ABNT. |
| `LEIA-ME.md` | Este guia. |

Para regerar o `.docx` depois de qualquer alteração no `.md`:

```bash
python3 docs/tcc/gerar-docx.py
```

---

## 1. Como enviar as partes

Pode mandar o texto na ordem que preferir — trechos, tópicos soltos, rascunho
ou já escrito. Eu encaixo cada parte na seção correspondente do `TCC-Vida+.md`
e regero o `.docx`.

O documento já está dividido assim (estrutura da NBR 14724:2024):

```
PARTE EXTERNA      Capa (obrigatória)
PRÉ-TEXTUAIS       Folha de rosto · Folha de aprovação · Dedicatória ·
                   Agradecimentos · Epígrafe · Resumo · Abstract ·
                   Lista de ilustrações · Lista de tabelas ·
                   Lista de abreviaturas e siglas · Sumário
TEXTUAIS           1 INTRODUÇÃO (1.1 Contextualização · 1.2 Objetivos ·
                   1.2.1 Objetivo geral · 1.2.2 Objetivos específicos ·
                   1.3 Justificativa · 1.4 Organização do trabalho)
                   2 REFERENCIAL TEÓRICO
                   3 METODOLOGIA
                   4 DESENVOLVIMENTO DO SISTEMA
                   5 RESULTADOS E DISCUSSÃO
                   6 CONCLUSÃO
PÓS-TEXTUAIS       Referências · Apêndice A · Anexo A
```

O que eu preciso que você envie, em ordem de prioridade:

1. **Dados de identificação:** nome completo, curso, instituição, título
   pretendido, orientador(a), cidade e ano de depósito.
2. **Resumo** e **Abstract** (ou os pontos principais, que eu redijo a versão
   inicial para você revisar).
3. **Introdução:** contexto, problema, justificativa.
4. **Objetivos específicos** (as alíneas de `a)` a `f)` estão parcialmente prontas).
5. **Referencial teórico:** autores e obras que você leu (ou os temas, que eu
   monto o texto e você completa as fontes).
6. **Metodologia:** como você desenvolveu e testou o sistema (datas, marcos, ferramentas).
7. **Desenvolvimento:** telas, decisões de projeto, dificuldades — e as imagens
   (prints) que quiser incluir, salvas em `docs/tcc/imagens/`.
8. **Resultados, limitações e conclusão.**
9. **Referências** completas das obras citadas.

> ⚠️ **Nada foi inventado sobre o seu trabalho.** O que não veio do código do
> projeto está marcado no documento em **vermelho itálico**, no formato
> `[[PREENCHER: ...]]`. Enquanto houver texto vermelho, o TCC está incompleto.

---

## 2. Normas seguidas (e o que já está aplicado automaticamente)

O gerador aplica a formatação, para você não precisar ajustar nada no Word:

| Norma | Item | Como está no documento |
|:---|:---|:---|
| **NBR 14724:2024** (versão corrigida de 01.04.2025) | 5.1 Formato | Papel A4 (21 × 29,7 cm), texto em preto, fonte **Arial 12** em todo o texto, inclusive na capa |
| **NBR 14724:2024** | 5.1 Margens | Anverso: **esquerda e superior 3 cm**, **direita e inferior 2 cm** |
| **NBR 14724:2024** | 5.2 Espaçamento | **1,5 entre linhas** no corpo do texto; **espaço simples** nas citações com mais de três linhas, nas referências, nas notas, nos títulos e fontes de ilustrações e tabelas e no bloco “natureza do trabalho” |
| **NBR 14724:2024** | 5.2 | Recuo de primeira linha de **1,25 cm**; natureza do trabalho, dedicatória e epígrafe alinhadas **do meio da mancha gráfica até a margem direita**, em espaço simples |
| **NBR 14724:2024** | 5.2.2 | Indicativo numérico em algarismo arábico, alinhado à esquerda, separado do título por um espaço; **sem ponto** depois do número; títulos separados do texto por uma linha de 1,5 |
| **NBR 14724:2024** | 5.2.2 / 5.4 | Cada **seção primária começa em nova página** |
| **NBR 14724:2024** | 5.2.3 | Títulos sem indicativo numérico (RESUMO, ABSTRACT, SUMÁRIO, REFERÊNCIAS, APÊNDICE, ANEXO, listas) **centralizados** |
| **NBR 14724:2024** | 5.2.4 | Páginas sem título e sem número: folha de aprovação, dedicatória e epígrafe |
| **NBR 14724:2024** | 5.3 Paginação | Folhas pré-textuais **contadas e não numeradas** (a capa não é contada); numeração em **algarismos arábicos, canto superior direito, a 2 cm da borda superior**, começando na **primeira folha da parte textual** (a Introdução) |
| **NBR 14724:2024** | 5.4 / NBR 6024:2012 | Numeração progressiva até a seção quinária (`1`, `1.1`, `1.1.1`), com destaque tipográfico gradual (primária em caixa alta e negrito; secundária em negrito; terciária em itálico) |
| **NBR 14724:2024** | 5.6 | Siglas indicadas entre parênteses na primeira menção, precedidas do nome completo |
| **NBR 14724:2024** | 5.8 / 5.9 | Ilustrações e tabelas com palavra designativa, número de ordem, travessão, título **acima** e **fonte** logo abaixo; tabelas no padrão IBGE (formato aberto, sem linhas verticais), fonte em tamanho menor |
| **NBR 14724:2024** | 4.2.1.9 a 4.2.1.12 | Listas de ilustrações, tabelas, abreviaturas e siglas com pontilhado até o número da página |
| **NBR 14724:2024** | 4.2.2 | Trabalho organizado em **seções, nunca em capítulos** |
| **NBR 6027:2012** | Sumário | Campo automático do Word, na mesma ordem e grafia do texto, com a página à direita |
| **NBR 6028:2021** | Resumo | **150 a 500 palavras**, parágrafo único, sem recuo, verbo na terceira pessoa; **Palavras-chave** em minúsculas, separadas por ponto e vírgula e finalizadas por ponto |
| **NBR 10520:2023** | Citações | Sistema **autor-data**, com o sobrenome apenas com a inicial maiúscula dentro dos parênteses — `(Sousa, 2021, p. 34)` — e **caixa alta na lista de referências**. Citações diretas com mais de três linhas: recuo de 4 cm, fonte 10, espaço simples, **sem aspas** |
| **NBR 6023** (edição vigente) | Referências | Sobrenome do autor em caixa alta, espaço simples dentro de cada referência e uma linha em branco simples entre elas, alinhadas à esquerda |

### Ajustes que o Word/Docs não fazem sozinhos

1. **Atualizar o sumário** depois de escrever o texto: no Word, `Ctrl+A` e
   `F9` (ou clique com o botão direito sobre o sumário → *Atualizar campo*); no
   Google Docs, clique sobre o sumário e use o botão de atualizar.
2. **Conferir a numeração inicial** da parte textual. O documento começa a
   numerar na folha 12 (as 11 folhas pré-textuais + a capa). Se você acrescentar
   ou remover páginas pré-textuais, ajuste em
   *Layout → Número de página → Formatar números de página → Iniciar em*.
3. **Ficha catalográfica:** é elaborada pela biblioteca da instituição e, no
   formato eletrônico, entra **logo após a folha de rosto**. Essa página
   **não é contada e nem numerada** (NBR 14724:2024, 5.3).
4. **Sublinhar o que é ilustração própria:** nas figuras/quadros feitos por
   você, a fonte deve dizer *“elaborado pelo próprio autor”* ou *“elaboração
   própria”* — como já está nos quadros e tabelas deste documento.
5. **Imagens:** salve os prints em `docs/tcc/imagens/` e avise; eu insiro no
   ponto correspondente com título, numeração e fonte. Para inserir manualmente,
   use no `.md` a linha `![descrição](docs/tcc/imagens/arquivo.png)`.

---

## 3. O que ainda está pendente (texto vermelho)

No `.docx`, procure o texto em **vermelho itálico**. As pendências atuais são:

- [ ] Identificação: instituição, autor, curso, título pretendido, orientador, cidade/ano
- [ ] Dedicatória, agradecimentos e epígrafe (opcionais — apague se não usar)
- [ ] Resumo e Abstract
- [ ] Introdução, contextualização e justificativa
- [ ] Alíneas `a)` e `f)` dos objetivos específicos
- [ ] Seção 2 (referencial teórico) inteira
- [ ] Seção 3.1, 3.3 (justificativas) e 3.4 (procedimentos de teste)
- [ ] Seções 4.1 (arquitetura), 4.3 a 4.7
- [ ] Seção 5 (resultados e discussão)
- [ ] Seção 6 (conclusão)
- [ ] Referências finais
- [ ] Anexo A (ou apagar)
- [ ] Páginas das listas de ilustrações, tabelas e siglas
- [ ] Atualizar o sumário

---

## 4. Observações técnicas

- O gerador usa `python-docx` e `Pillow`:
  `pip install python-docx Pillow`.
- Todo o layout é definido no próprio código (`docs/tcc/gerar-docx.py`), então
  mudanças de formatação valem para o documento inteiro de uma só vez.
- O `.docx` é a fonte oficial para impressão e para a entrega. Para gerar o PDF,
  abra no Word/Google Docs e exporte (*Arquivo → Salvar como → PDF*).
- Este material é de apoio ao texto acadêmico: as normas ABNT são de consulta
  paga e o que está aplicado aqui segue o texto das normas vigentes
  (NBR 14724:2024, NBR 6024:2012, NBR 6027:2012, NBR 6028:2021, NBR 10520:2023 e
  NBR 6023). Se a sua instituição tiver um manual próprio, ele prevalece sobre a
  norma geral — me avise e eu ajusto.
