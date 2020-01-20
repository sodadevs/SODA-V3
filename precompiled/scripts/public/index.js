require('ion-rangeslider');
const Web3 = require('web3')
const BN = Web3.utils.BN

const subsciptions = []

Date.prototype.toMyString = function(){
	return this.toLocaleString(undefined, {
		hour12: false,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit"
	})
}

const templates = new class {
	get(name){
		return document.importNode(
			document.getElementById(`js_template__${name}`).content.firstChild,
			true
		)
	}
}
const event_reduplicator = new function(){
	const tmp = new Set()
	this.check = (event) => {
		const key = `${event.blockNumber}_${event.blockNumber}`
		if(tmp.has(key)) return true
		tmp.add(key)
		return false
	}
	this.clear = () => tmp.clear()
}


function setSecurity(security, status, sv){
	if(!sv.classList.contains('security-view'))
		throw "wrong security-view"
	const state  = sv.dataset.state = 
		status == 0 ? 'repaid' : 
		status == 2 ? 'liqudated' : 
		security < 110 ?  'liquidation' :
		security < 180 ?  'danger' :
		security < 250 ?  'safe' :
						  'very-safe'
	
	sv.querySelector('.security-view__amount').innerText = 
		parseFloat(security) ? security : null

	sv.querySelectorAll('.security-view__label').forEach(label => {
		if(label.dataset.state == state)
			label.classList.remove('hide')
		else label.classList.add('hide')
	})

}

const enableEhereum = () => {
	const web3 = new Web3(ethereum)
	Promise.all([
		ethereum.enable().then(x=> x[0]),
		web3,
		web3.eth.getChainId()
	]).then(start)
}

function changeAccountsHandler(accounts){
	if (accounts.length > 0) enableEhereum()
	else {
		document.querySelectorAll('[data-type=account]')
			.forEach(x => x.innerText = null)
		document.querySelector('.pop-up').classList.add('open')
	}
}

const params = {
	lastPrice:0
}
const info = {
	DAI:  require('../static/contracts/DAI.json'),
	testBTC:  require('../static/contracts/DeFiBTC.json'),
	LendDAI: require('../static/contracts/SODALend.json'),
	BorrowDAI: require('../static/contracts/SODABorrow.json'),
	Price: require('../static/contracts/PriceAggregator.json'),
}
const updater = new class Updater {
	constructor(){
		this.updaters = []
		this.start()
		this.requests = {}
	}
	start(interval){
		this.interval = interval || this.interval || 1000
		this.stop()
		this.intervalID = setInterval(() => {
			this.updaters.forEach((updater, id) => {
				Promise.resolve( updater.getValue() ).then(val =>  {
					if(updater.onChange && val != this.requests[id]){
						this.requests[id] = val
						updater.onChange(val)
					}
				})
			})
		}, this.interval);
	}
	stop(){ clearInterval(this.intervalID) }
	clear(){ this.updaters = []}
	push(getValue, onChange){ this.updaters.push({getValue, onChange}) }
}

const handlers = new class {
	constructor(){
		this.clear()
	}
	create(key, handler){
		if(this.handlers.get(key)) throw "handler exists"
		this.handlers.set(key, handler)
	}
	clear(){
		this.handlers = new Map()
	}
	get(key){
		const clz = this
		return function (){
			return (clz.handlers.get(key) || function() {
				throw `there are no such handler ${key}`
			}).apply(this, arguments)
		}
	}
}

if(ethereum) {
	const web3 = new Web3(ethereum)
	ethereum.autoRefreshOnNetworkChange = false
	const timeoutID = setTimeout(() => {
		window.location.reload()
	}, 1000)
	web3.eth.getAccounts().then( result => {
		clearTimeout(timeoutID)
		changeAccountsHandler(result)
		ethereum.on('accountsChanged', changeAccountsHandler )
	})
	document.querySelector('.connect--metamask')
		.addEventListener('click', enableEhereum)

} else {
	document.querySelector('.pop-up').classList.add('open')
}








function start([address, web3, chainID]){
	console.log('connected with:', address)
	const loanTypes = ['DAI']
	const collateralTypes = ['testBTC']
	document.querySelector('.loans-history__container').innerHTML = null
	document.querySelector("#loan-select .select__content").innerHTML = null
	updater.clear()
	handlers.clear()
	event_reduplicator.clear()
	while(subsciptions.length) subsciptions.pop().unsubscribe(console.log)
	
	const {Price} = window.contracts = Object.keys(info)
		.reduce((r, x)=> {
			r[x] = new web3.eth.Contract(info[x].ABI, info[x][chainID],{from: address, gasPrice:20000000000})
			return r
		},{})

	loanTypes.forEach(type =>{
		const Borrow = contracts[`Borrow${type}`]
		const Lend = contracts[`Lend${type}`]
		updater.push(() => Lend.methods.getPoolBalance().call(),
			value => {
				params.poolBalance = value
				const max = Math.floor(value / 1e16) / 1e2
				const el = document.getElementById('loan-amount')
				el.placeholder = el.dataset.placeholder + max
				el.max = max	
				handlers.get('loan-params-recount').call()				
			})
		updater.push(() => Price.methods.latestAnswer().call(),
			value => {
				params.lastPrice = value / 1e8
				console.log("btc price:",params.lastPrice)	
				handlers.get('loan-params-recount').call()		
			})
		updater.push(() => Borrow.methods.lastRate().call(), rate => {
			const apr = params.apr = (rate * 365 / 1e7).toFixed(2)
			document.querySelectorAll('[data-attr=apr]')
				.forEach(x => x.innerText = apr)
			handlers.get('loan-params-recount').call()	
		})
		function approve(token, owner, spender, amount){
			const max_amount = new BN(2).pow(new BN(256)).sub(new BN(1)).toString()
			return token.methods.allowance(owner, spender).call()
				.then(web3.utils.toBN)
				.then(x=>x.gte(new BN(amount)))
				.then( enough =>
					enough ? true : token.methods.approve(spender, max_amount).send()
				)
		}

		document.querySelector('.pop-up').classList.remove('open')
		document.querySelectorAll('[data-type=account]').forEach(x=>{
			x.innerText = address
		})
		handlers.create('loan-submit', function (e){
			e.preventDefault()
			this.classList.add('confirm')
			delete document.getElementById('state-line-take').dataset.status 
			document.querySelector('.consent__cansel-box').classList.remove('hide')
		})
		handlers.create('loan-cancel', function (e){
			document.forms.loan.classList.remove('confirm')
		})
		handlers.create('loan-params-recount', () => {
			const {lastPrice, apr, poolBalance} = params
			const amount = document.forms.loan.amount.value || poolBalance / 1e18
			const security = $("#security-range").data('from')
			const requiredCollateral = (Math.ceil(amount * security / lastPrice * 100) /10000).toFixed(4)
			document.getElementById('loan-amount-2').innerText = amount
			document.getElementById('collateral-amount-2').innerText = requiredCollateral
			document.getElementById('required-collateral').innerText = requiredCollateral
			document.getElementById('daily-interest').innerText = 
				(amount * apr / 36500).toFixed(4)
			document.getElementById('daily-interest').dataset.currency = 
				document.forms.loan.loan_token.value
			document.getElementById('required-collateral').dataset.currency = 
				document.forms.loan.collateral_token.value
			document.getElementById('collateral-amount-2').dataset.currency = 
				document.forms.loan.collateral_token.value
			document.getElementById('loan-amount-2').dataset.currency = 
				document.forms.loan.loan_token.value
		})
		handlers.create('loan-start-process',function(){
			const {lastPrice, apr, poolBalance} = params
			const amount = (document.forms.loan.amount.value * 1e18).toFixed()
			const security = $("#security-range").data('from')
			const collateral = Math.ceil(amount * security / lastPrice / 1e12).toFixed()
			const _BTC = contracts[document.forms.loan.collateral_token.value]
			const _Borrow = contracts['Borrow'+document.forms.loan.loan_token.value]
			this.classList.add('loading')
			document.querySelector('.consent__cansel-box').classList.add('hide')

			document.getElementById('state-line-take').dataset.status = 'waiting'
			approve(_BTC, address, _Borrow._address, amount)
				.then(()=>
					document.getElementById('state-line-take').dataset.status = 1
				)
				.then(() => _Borrow.methods.borrow(address,amount,collateral,_BTC._address)
					.send(()=>document.getElementById('state-line-take').dataset.status = 2) 
				)
				.then(() => 
					document.getElementById('state-line-take').dataset.status = 3
				)
		})

		handlers.create('loan-repay',function(e){
			e.preventDefault()
			const id = this.id.value
			const token = contracts[this.token.value]
			const borrow = contracts[`Borrow${this.token.value}`]
			const amount = (this.amount.value * 1e18).toFixed()
			this.submit.classList.add('loading')
			approve(token, address, borrow._address, amount)
				.then(() => borrow.methods.repay(id, amount).send() )
				.then(tx => {
					console.log(tx)
					this.submit.classList.remove('loading')
				})
		})
		subsciptions.push(
			Borrow.events.LoanRepayment({fromBlock:'latest', filter:{borrower:address}}, (err, event) => {
				if(event_reduplicator.check(event)) return;
				const {id, interestAmount, repaymentAmount} = event.returnValues
				Promise.all([
					Borrow.methods.loan(id).call(),
					Price.methods.latestAnswer().call()
				]).then(([loan, price]) => {
					const container = document.querySelector('.loans-history__container')
					const card = container.querySelector(`[data-loan-id=${type}_${id}]`)
					const security = (loan.collateralAmount * price * 1e4 / loan.loanAmount).toFixed(2)
					card.dataset.status = loan.state == 0 ? 5 : 4
					card.querySelector('[data-prop=collateral]').innerText = (loan.collateralAmount / 1e8).toFixed(8)		
					card.querySelector('[data-prop=interest]').innerText = 0
						
					setSecurity( security, loan.state, card.querySelector('.security-view') )
					if(loan.state != 1 && container.childElementCount > 1){
						container.removeChild(card)
						let cur = container.firstElementChild
						const status = loan.state > 0 ? 0 : 5
						while(
							cur.nextElementSibling && (
								cur.dataset.status < status ||
								cur.dataset.taken > card.dataset.taken
							)
						) cur = cur.nextElementSibling
						if(cur.dataset.taken > card.dataset.taken)
							container.appendChild(card)
						else container.insertBefore(card, cur)
					}



					const select = document.querySelector('#loan-select .select')
					const selectContent = document.querySelector("#loan-select .select__content")

					select.querySelectorAll(`[data-loan-id=${type}_${id}]`)
						.forEach(option => {
							option.dataset.state = loan.state == 0 ? 5 : 4 
							setSecurity( security, loan.state, option.querySelector('.security-view') )
						})

					if(loan.state != 1 && selectContent.childElementCount > 1){
						const option = selectContent.querySelector(`[data-loan-id=${type}_${id}]`)
						selectContent.removeChild(option)
						let cur = selectContent.firstElementChild
						const status = loan.state > 0 ? 0 : 5
						while(
							cur.nextElementSibling && (
								cur.dataset.state < status ||
								cur.dataset.taken > option.dataset.taken
							)
						) cur = cur.nextElementSibling
						if(cur.dataset.taken > option.dataset.taken)
							selectContent.appendChild(option)
						else selectContent.insertBefore(option, cur)
					}

					if(select.dataset.selected == `${type}_${id}`){
						document.querySelectorAll('[data-type=loan-debt]').forEach(
							x => x.innerText = (loan.loanAmount / 1e18).toFixed(4)
						)
					}
				})
			})
		)
		subsciptions.push(
			Borrow.events.LoanIssued({fromBlock:0, filter:{borrower:address}}, (err,y,z) => {
				if(event_reduplicator.check(y)) return;
				
				const {id, borrower, amount, collateral} = y.returnValues

				Promise.all([
					Borrow.methods.loan(id).call(),
					web3.eth.getBlock(y.blockNumber),
					Borrow.methods.interestAmount(id).call(),
					Price.methods.latestAnswer().call()
				]).then(([loan, block, interest, price]) => {
					params.lastPrice = price
					const card = templates.get('loans-history-card')
					const security = (loan.collateralAmount * price * 1e4 / (interest - -loan.loanAmount)).toFixed(2)
					card.querySelector('[data-prop=amount]').innerText = (amount / 1e18).toFixed(2)
					card.dataset.loanId = `${type}_${id}`
					card.dataset.taken = block.timestamp
					card.dataset.status = 
						loan.state == 0 ? 5 :
						loan.loanAmount != amount ? 4 :3
					card.querySelector('[data-prop=taken]').innerText =
						new Date(block.timestamp * 1e3).toMyString()
					card.querySelector('[data-prop=collateral]').innerText = (loan.collateralAmount / 1e8).toFixed(8)		
					card.querySelector('[data-prop=interest]').innerText = interest / 1e18		
					setSecurity( security, loan.state, card.querySelector('.security-view') )

					{
						const container = document.querySelector('.loans-history__container')
						let cur = container.firstElementChild
						const status = loan.state == 1
						while(
							cur && (
								(cur.dataset.status < 5) > status ||
								(cur.dataset.status < 5) == status &&
								(cur.dataset.taken > block.timestamp)
							) //&& cur.dataset.status >= status
						) cur = cur.nextElementSibling
						if(cur) container.insertBefore(card, cur)
						else container.appendChild(card)
					} 


					card.querySelectorAll('.loan-history__header')
						.forEach(x=>x.addEventListener('click', function(){
							this.classList.toggle('show')
						}))

					
					const selectContent = document.querySelector("#loan-select .select__content")
					const option = templates.get('select-option')
					option.querySelector('[data-prop=amount]').innerText = 
						(amount / 1e18).toFixed(2)
					option.querySelector('[data-prop=taken]').innerText = 
						new Date(block.timestamp * 1e3).toMyString()
					option.dataset.taken = block.timestamp
					setSecurity( security, loan.state, option.querySelector('.security-view') )
					option.dataset.loanId = `${type}_${id}`
					
					option.dataset.state = 
						loan.state == 0 ? 5 :
						loan.loanAmount != amount ? 4 :3
					option.addEventListener('click', function(){
						const selected = document.importNode(this, true)
						const select = document.querySelector('#loan-select .select')
						selected.classList.remove('selected')
						select.dataset.selected = `${type}_${id}`
						select.querySelector('.select__selected').innerHTML = ""
						select.querySelector('.select__selected').appendChild(selected)
						select.querySelectorAll('.select__content .select__elem').forEach(x => x.classList.remove("selected"))
						this.classList.add("selected")
						select.classList.remove("open")
						document.querySelectorAll('.overlay-dyn').forEach(x => document.body.removeChild(x))
						
						contracts[type].methods.balanceOf(address).call()
							.then( x => (x/1e18).toFixed(4) )
							.then( amount => 
								document.querySelector('[data-type=loan-user-balance]')
									.innerText = amount
							)
						document.forms['loan-repay'].id.value = id
						document.forms['loan-repay'].token.value = type
						document.getElementById('state-line').dataset.status = 'waiting'
						document.querySelectorAll('[data-type=active-loan-info]').forEach(
								x=>x.classList.add('hide')
							)
						Promise.all([
							Borrow.methods.loan(id).call(),
							Borrow.methods.interestAmount(id).call()
						]).then(([loan, interest]) => {
							const security = (loan.collateralAmount * params.lastPrice * 1e4 / (interest - -loan.loanAmount)).toFixed(2)
					
							const wth = document.querySelector('.box-withdraw-repay-collateral')
							wth.dataset.repay = wth.dataset.collateral = loan.state > 0 ? 1 : 2
							wth.classList.remove('hide')
							if(loan.state == 1) document.querySelector('.w-r-loan-deals-box')
								.classList.remove('hide')
							console.log(security)
							setSecurity(security, loan.state, wth.querySelector('.security-view'))
							document.querySelectorAll('[data-type=loan-debt]').forEach(
									x => x.innerText = ((loan.loanAmount - -interest) / 1e18).toFixed(4)
								)
							document.querySelectorAll('[data-attr=SBTC-amount]')
								.forEach(output => {
									output.innerText = loan.collateralAmount / 1e8
									output.dataset.currency = Object.entries(contracts).filter(x=>x[1]._address == '0xA6aa900166694A22F2c85E19cabE2100531F32C8')[0][0]
								})
							document.getElementById('state-line')
								.dataset.status =
									loan.state == 0 ? 5 :
									loan.loanAmount != amount ? 4 :3
						})
					})
					{
						const status = loan.state == 1
						let cur = selectContent.firstElementChild
						while(
							cur && (
								(cur.dataset.status < 5) > status ||
								(cur.dataset.status < 5) == status &&
								(cur.dataset.taken > block.timestamp)
							)
						) cur = cur.nextElementSibling
						if(cur) selectContent.insertBefore(option, cur)
						else selectContent.appendChild(option) 
					} 
					card.querySelector('[data-prop=goto-button]').addEventListener('click', ()=>{
						openSection('withdraw-repay')
						option.click()
					})
				})
			})
		)

	})
}
document.querySelector('[data-action=js-process-loan]')
	.addEventListener('click', handlers.get('loan-start-process'))
document.forms.loan.amount.addEventListener('change', handlers.get('loan-params-recount'));
document.forms.loan.amount.addEventListener('keyup', handlers.get('loan-params-recount'));
document.forms.loan.addEventListener('submit', handlers.get('loan-submit'));
document.forms.loan.querySelector('[data-action=cancel]').addEventListener('click', handlers.get('loan-cancel'));

document.querySelectorAll('[data-type=active-loan-info]').forEach(block => {
	block.querySelectorAll('.box-withdraw-repay-collateral__tab').forEach(tab => {
		tab.addEventListener('click', () => {
			block.dataset.action = tab.dataset.type
		})
	})
})

document.forms['loan-repay'].addEventListener('submit', handlers.get('loan-repay'))

document.querySelectorAll('.select').forEach(select => {
	select.querySelector('.select__selected').addEventListener('click', function(event){
		if (select.querySelector('.select__content:empty')) return 

		document.querySelectorAll('.overlay-dyn').forEach(x => document.body.removeChild(x))
		const overlay = document.createElement("div")
		document.body.appendChild(overlay)
		overlay.classList.add("overlay-dyn")
		overlay.addEventListener('click', function(event){
			document.querySelectorAll(".select").forEach(x => x.classList.remove("open"))
			document.body.removeChild(overlay)
		})
		
		this.parentNode.classList.add("open")
		// document.querySelector('.overlay').classList.toggle("open")
	})
})

document.querySelectorAll(".lang-box").forEach(x => x.addEventListener('click', function(){
	if (document.querySelectorAll('.overlay-dyn'))
		document.querySelectorAll('.overlay-dyn').forEach(y => document.body.removeChild(y))
	const overlay = document.createElement("div")
	this.appendChild(overlay)
	overlay.classList.add("overlay-dyn")
	overlay.addEventListener('click', function(event){
		this.querySelector(".lang-dropdown").classList.remove("open")
		this.removeChild(overlay)
		event.stopPropagation();
	})

	this.querySelector(".lang-dropdown").classList.add("open")

}))

document.querySelectorAll('[data-page]').forEach(
	x => x.addEventListener('click', function(){
		openSection(this.dataset.page)
		document.querySelector('.overlay').classList.remove('open')
		document.querySelector('.sidebar').classList.remove('open')
	})
)

function openSection(str) {
	document.querySelectorAll(".section").forEach(x => x.classList.add("hide"));
	document.querySelectorAll(".menu-submenu__elem").forEach(x => x.classList.remove("selected"));

	document.querySelector(`.section--${str}`).classList.remove('hide');
	document.querySelector(`.menu-submenu__elem[data-page=${str}]`).classList.add("selected")
}

$("#security-range").ionRangeSlider({
    skin:'round',
    min: 140,
    max: 400,
    from: 170,
    step: 5,
    prettify: x =>`${x}%`,
    onChange: handlers.get('loan-params-recount')
});



(function (stop){
	if(stop) return;
	window.params = params
	window.BN = BN
	window.info = info
	window.updater = updater
	window.openSection = openSection
	window.subsciptions = subsciptions
})(false);