/**
 * Upload Controller, implements frontend for Swiff.Uploader
 * @author     Anthony Theocharis
 */
var UploadManager = new Class({
	form: null,
	action: null,
	fields: null,
	submit: null,
	submitted: false,
	uploadButton: null,
	browseButton: null,


	initialize: function(form, action) {
		this.form = $(form);
		this.action = action;
		this.fields = $$(this.form.elements).filter(function(el) {
			// filter out submit buttons
			return el.get('type') != 'submit';
		}, this).map(function(value) {
			// create upload field wrappers
			return new UploadField(this, value);
		}, this);

		console.log('fields:', this.fields)

		this.submit = this.form.getElement('input[type=submit]');
		this.form.addEvent('submit', this.onSubmit.bind(this));

		var opts = {
			url: this.action,
			onSuccess: this.displayErrors.bind(this),
			link: 'cancel' /* all new calls take precedence */
		};
		this.req = new Request.JSON(opts);
	},

	onSubmit: function(e) {
		if (e) {
			new Event(e).stop();
			this.validate();
			this.submit.set('disabled', true);
			this.submitted = true;
			return false;
		}
		return true;
	},

	validate: function(o) {
		var data = {};
		data['validate'] = JSON.encode(this.fields.map(function(f){return f.name;}));
		this.fields.each(function(f) {
			data[f.name] = f.field.get('value');
		});
		opts = {data: data}
		if (o) {
			opts = $extend(o, opts);
		}
		console.log(opts);
		this.req.send(opts);
	},

	displayErrors: function(responseJSON) {
		if (this.submitted && responseJSON['valid']) {
			this.form.submit();
		} else {
			this.fields.each(function(field) {
				field.displayError(responseJSON);
			});
		}

		if (this.submitted) {
			this.submit.set('disabled', false);
		}
	}
});

var UploadField = new Class({
	name: null,
	error: null,
	field: null,
	td: null,
	manager: null,
	req: null,

	initialize: function(manager, field) {
		this.manager = manager;
		this.field = field;
		this.field.addEvent('blur', this.validate.bind(this));
		this.name = this.field.get('name');
		/* NB: this path relies heavily on the current table layout,
		 * and should be updated along with the template */
		this.td = field.parentNode;
		this.error = this.td.parentNode.getPrevious().getElements('.field-error')[0];

		var opts = {
			url: this.manager.action,
			onSuccess: this.displayError.bind(this),
			link: 'cancel' /* all new calls take precedence */
		};
		this.req = new Request.JSON(opts);
	},

	displayError: function(responseJSON) {
		if (err = responseJSON['err'][this.field.get('name')]) {
			this.error.set('html', err);
			this.td.removeClass('noerr');
			this.td.addClass('err');
		} else {
			this.error.set('html', '');
			this.td.removeClass('err');
			this.td.addClass('noerr');
		}
	},

	validate: function() {
		var data = {};
		data['validate'] = JSON.encode([this.name]);
		data[this.field.get('name')] = this.field.get('value');
		this.req.send({data: data});
	}
});

var SwiffUploadManager = new Class({
	form: null,
	action: null,
	uploader: null,
	browseButton: null,
	uploadButton: null,
	progressBar: null,
	enabled: null,
	
	initialize: function(form, action, browseButton, uploadButton, statusSpan) {
		if (Browser.Platform.linux) {
			// There's a bug in the flash player for linux that freezes the browser with swiff.uploader
			// don't bother setting it up.
			return;
		}

		this.form = $(form);
		this.action = action;
		this.browseButton = $(browseButton);
		this.uploadButton = $(uploadButton);
		this.statusSpan = $(statusSpan)

		this.enabled = false;

		var submit = this.form.getElement('input[type=submit]');
		var finput = this.form.getElement('input[type=file]');
		// Uploader instance
		this.uploader = new Swiff.Uploader({
			path: '/scripts/third-party/Swiff.Uploader.swf',
			url: this.action,
			verbose: false,
			queued: false,
			multiple: false,
			target: this.browseButton,
			fieldName: finput.get('name'),
			instantStart: false,
			fileSizeMax: 500 * 1024 * 1024, // 500 mb upload limit
			onSelectSuccess: this.onSelectSuccess.bind(this),
			onSelectFail: this.onSelectFail.bind(this),
			appendCookieData: true,
			onQueue: this.onQueue.bind(this),
			onFileComplete: this.onFileComplete.bind(this),
			onComplete: this.onComplete.bind(this)
		});

		// Button state
		this.browseButton.addEvents({
			mouseenter: function() {
				this.uploader.reposition();
			}.bind(this)
		});

		this.uploadButton.addEvents({
			click: function() {
				this.startUpload();
			}.bind(this)
		});

		// Overwrite the onSuccess event for the UploadManager's validation check.
		// It won't ever be called by UploadMGR because we just removed the button that triggers it
		// so it should be safe to overwrite for our own purposes.
		UploadMGR.req.removeEvents('onSuccess');
		UploadMGR.req.addEvents({onSuccess: this.validated.bind(this)});
		UploadMGR.fields = UploadMGR.fields.filter(function(f) {
			return f.field.get('type') != 'file';
		});

		finput.parentNode.parentNode.getPrevious().destroy();
		finput.parentNode.parentNode.destroy();
		submit.parentNode.parentNode.destroy()
	},
	
	getFormValues: function() {
		var values = {};
		$$(this.form.elements).each(function(el) {
			values[el.get('name')] = el.get('value');
		});
		return values;
	},

	validated: function(responseJSON) {
		if (responseJSON['valid']) {
			opts = {data: this.getFormValues()};
			console.log(opts);
			this.uploader.setOptions(opts);
			this.uploader.start();
		} else {
			UploadMGR.displayErrors(responseJSON);
		}
	},

	startUpload: function() {
		if (this.enabled) {
			UploadMGR.validate();
		}
	},

	onQueue: function() {
		if (!this.uploader.uploading) return;
		var size = Swiff.Uploader.formatUnit(this.uploader.size, 'b');
		this.statusSpan.set('html', 'Uploading... ' + this.uploader.percentLoaded + '% of ' + size);
	},

	onSelectFail: function(files) {
		console.log(files[0].name, files[0].validationError);
	},

	onFileComplete: function(file) {
		console.log(file.response);
		if (file.response.error) {
			this.statusSpan.set('html',
				'Failed Upload' + " " + this.uploader.fileList[0].name + " " + this.uploader.fileList[0].response.code + " " + this.uploader.fileList[0].response.error
			);
		} else {
			var json = JSON.decode(file.response.text, true)
			console.log('Successful Upload', this.uploader.fileList[0].name, json, file);
		}

		file.remove();
		this.uploader.setEnabled(true);
	},

	onSelectSuccess: function(files) {
		this.uploader.setEnabled(false);
		this.enabled = true;
		this.uploadButton.addClass('enabled');
		this.statusSpan.set('html', 'You have selected '+files[0].name+' - '+Swiff.Uploader.formatUnit(files[0].size, 'b'));
	},

	onComplete: function() {
		console.log('oncomplete called');
	},

});
