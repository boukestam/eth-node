# Introduction

This is the first post in a series on writing an Ethereum node from scratch. I'm the kind of person that understands things by trying to recreate it for myself. For that reason I decided to finally tackle a big unknown: the Ethereum network. 

I've been working as a blockchain developer for 1.5 years now, but honestly it's inner workings are still a big mystery to me. How do nodes talk to each other and collectively decide on the 'true' chain? How does all the cryptography actually work? What happens when I store a variable?

### The goal

The goal is to learn about all the different aspects that make the Ethereum network work. The goal is **not** to create the most optimized Ethereum node. I will start out creating everything in the most simple way and only optimize where needed. Throughout the project I will dive in head-first and try to tackle the hurdles as they come.

### The plan

With this project I try to answer all these questions, and hopefully help others who are looking for the answers. This is my plan:

- use Node.js/Typescript as programming language because I am familiar with it
- try to use as few libraries as possible
- use the [Ethereum Yellow Paper](https://ethereum.github.io/yellowpaper/paper.pdf) as reference
- start as simple as possible and build out from there

Some of you might question the decision to use NodeJS and Typescript for this project. But I think it will help me and others understand the code more easily since many people are familiar with it.

### Setup

I start the project by [downloading Node.js](https://nodejs.org/en/download/). The installation is really quick and only takes a minute. After that I create a new directory and initialize my project:

```
npm install --global yarn // if you don't have it yet
yarn init
yarn add -D typescript
yarn add ts-node
yarn add -D tslib @types/node
```

I then create a new file called ```main.ts``` and put in the following code:

```typescript
console.log('Hello World!');
```

I can then run it with ```ts-node main.ts```. Now we can get started on the actual fun stuff!

### Chapters

1. [Node Discovery Protocol](Node Discovery Protocol.md)
2. [RLP Encoding](RLP Encoding.md)
3. [Kademlia Table](Kademlia Table.md)
4. [RLPx Transport Protocol](RLPx Transport Protocol.md)

