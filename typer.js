var Word = Backbone.Model.extend({
	defaults: {
		highlight: 0,
		y: 0,
		speed: 1
	},
	move: function() {
		this.set({y:this.get('y') + this.get('speed')});
	}
});

var Words = Backbone.Collection.extend({
	model: Word
});

var WordView = Backbone.View.extend({
	
	letter_width: 25,

	initialize: function() {
		$(this.el).css({position:'absolute'});
		var string = this.model.get('string');
		this.fixingPosition();
		for(var i = 0;i < string.length;i++) {
			$(this.el)
				.append($('<div>')
					.css({
						width: this.letter_width + 'px',
						padding:'5px 2px',
						'border-radius':'4px',
						'background-color':'#fff',
						border:'1px solid #ccc',
						'text-align':'center',
						float:'left'
					})
					.text(string.charAt(i).toUpperCase()));
		}
		
		this.listenTo(this.model, 'remove', this.remove);
		
		this.render();
	},

	fixingPosition: function() {
		var string = this.model.get('string');
		var word_width = string.length * this.letter_width;
		if(this.model.get('x') + word_width > $(window).width()) {
			this.model.set({x:$(window).width() - word_width});
		}
	},
	
	render:function() {
		$(this.el).css({
			top:this.model.get('y') + 'px',
			left:this.model.get('x') + 'px'
		});
		var highlight = this.model.get('highlight');
		$(this.el).find('div').each(function(index,element) {
			if(index < highlight) {
				$(element).css({'font-weight':'bolder','background-color':'#aaa',color:'#fff'});
			} else {
				$(element).css({'font-weight':'normal','background-color':'#fff',color:'#000'});
			}
		});
	}
});

var TyperView = Backbone.View.extend({
	initialize: function() {
		var wrapper = $('<div>')
			.css({
				position:'fixed',
				top:'0',
				left:'0',
				width:'100%',
				height:'100%'
			});
		this.wrapper = wrapper;
		
		var self = this;
		var text_input = $('<input>')
			.addClass('form-control')
			.css({
				'border-radius':'4px',
				position:'absolute',
				bottom:'0',
				'min-width':'80%',
				width:'80%',
				'margin-bottom':'10px',
				'z-index':'1000'
			}).keyup(function() {
				var words = self.model.get('words');
				for(var i = 0;i < words.length;i++) {
					var word = words.at(i);
					var typed_string = $(this).val();
					var string = word.get('string');
					var highlight = word.get('highlight');
					if(string.toLowerCase().indexOf(typed_string.toLowerCase()) == 0) {
						word.set({highlight:typed_string.length});
						if(typed_string.length == string.length) {
							$(this).val('');
						}
					} else {
						if (highlight > 0) {
							self.model.set({score: self.model.get('score') - (typed_string.length - highlight)});
						}
						word.set({highlight:0});
					}
				}
			});
		
		var text_score = self.text_score = $('<h2>');

		var button_play = $('<button id="btn-play" type="button" class="btn btn-default"><i class="glyphicon glyphicon-play"></i></button>').on('click', function(){
			self.model.start();
			button_play.hide();
			button_stop.removeAttr('disabled');
			button_pause.show();
			text_input.focus();
		});
		var button_stop = $('<button id="btn-stop" type="button" class="btn btn-default"><i class="glyphicon glyphicon-stop"></i></button>').attr({ disabled: true }).on('click', function(){
			self.model.stop();
			button_play.show();
			button_stop.attr('disabled', true);
			button_pause.hide();
		});
		var button_pause = $('<button id="btn-pause" type="button" class="btn btn-default"><i class="glyphicon glyphicon-pause"></i></button>').hide().on('click', function(){
			self.model.pause();
			button_play.show();
			button_stop.attr('disabled', true);
			button_pause.hide()
		});

		var button_container = $('<div class="btn-group" role="group" aria-label="..."></div>').append(button_play).append(button_pause).append(button_stop);

		$(this.el)
			.append(wrapper
				.append($('<form>')
					.attr({
						role:'form'
					})
					.submit(function() {
						return false;
					})
					.append(text_input))
				.append(button_container)
				.append(text_score));
		
		function fixingTextInputPosition() {
			text_input.css({left:((wrapper.width() - text_input.width()) / 2) + 'px'});
			text_input.focus();
		}

		$(window).on('resize', function(){
			fixingTextInputPosition();
			
			var words = self.model.get('words');
			for(var i = 0;i < words.length;i++) {
				var word = words.at(i);
				if(word.get('view')) {
					word.get('view').fixingPosition();
				}
			}
		});

		fixingTextInputPosition();
		
		this.listenTo(this.model, 'change', this.render);
	},
	
	render: function() {
		var model = this.model;
		var words = model.get('words');
		this.text_score.text(model.get('score'));
		
		for(var i = 0;i < words.length;i++) {
			var word = words.at(i);
			if(!word.get('view')) {
				var word_view_wrapper = $('<div>');
				this.wrapper.append(word_view_wrapper);
				word.set({
					view: new WordView({
						model: word,
						el: word_view_wrapper
					})
				});
			} else {
				word.get('view').render();
			}
		}
	}
});

var Typer = Backbone.Model.extend({
	defaults:{
		max_num_words:10,
		min_distance_between_words:50,
		words:new Words(),
		min_speed:1,
		max_speed:5,
		score: 0
	},

	worker: null,

	intervalId: null,
	
	initialize: function() {
		new TyperView({
			model: this,
			el: $(document.body)
		});
	},

	start: function() {
		var self = this;
		if (window.Worker) {
			self.worker = new Worker('iterate-worker.js');
			self.worker.onmessage = function(event) {
				self.iterate();
			};
		} else {
			var animation_delay = 100;
			if (self.intervalId) {
				clearInterval(self.intervalId);
			}
			self.intervalId = setInterval(function() {
				self.iterate();
			}, animation_delay);
		}

	},
	
	stop: function() {
		var self = this;
		self.pause();
		var words = self.get('words');
		words.forEach(function(word){
			words.remove(word);
		});
		self.set({
			score: 0
		});
	},
	
	pause: function() {
		var self = this;
		if (self.worker) {
			self.worker.terminate();
			self.worker = null;
		} else if (self.intervalId) {
			clearInterval(self.intervalId);
		}
	},
	
	iterate: function() {
		var words = this.get('words');
		if(words.length < this.get('max_num_words')) {
			var top_most_word = undefined;
			for(var i = 0;i < words.length;i++) {
				var word = words.at(i);
				if(!top_most_word) {
					top_most_word = word;
				} else if(word.get('y') < top_most_word.get('y')) {
					top_most_word = word;
				}
			}
			
			if(!top_most_word || top_most_word.get('y') > this.get('min_distance_between_words')) {
				var random_company_name_index = this.random_number_from_interval(0,company_names.length - 1);
				var string = company_names[random_company_name_index];
				var filtered_string = '';
				for(var j = 0;j < string.length;j++) {
					if(/^[a-zA-Z()]+$/.test(string.charAt(j))) {
						filtered_string += string.charAt(j);
					}
				}
				
				var word = new Word({
					x:this.random_number_from_interval(0,$(window).width()),
					y:0,
					string:filtered_string,
					speed:this.random_number_from_interval(this.get('min_speed'),this.get('max_speed'))
				});
				words.add(word);
			}
		}
		
		var words_to_be_removed = [];
		for(var i = 0;i < words.length;i++) {
			var word = words.at(i);
			word.move();
			
			if(word.get('y') > $(window).height() || word.get('move_next_iteration')) {
				words_to_be_removed.push(word);
			}
			
			if(word.get('highlight') && word.get('string').length == word.get('highlight')) {
				// Sukses
				word.set({move_next_iteration:true});
				this.set({score: this.get('score') + word.get('highlight') });
			}
		}
		
		for(var i = 0;i < words_to_be_removed.length;i++) {
			words.remove(words_to_be_removed[i]);
		}
		
		this.trigger('change');
	},
	
	random_number_from_interval: function(min,max) {
	    return Math.floor(Math.random()*(max-min+1)+min);
	}
});