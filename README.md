# ramp

[![Build status](https://secure.travis-ci.org/busterjs/ramp.png?branch=master)](http://travis-ci.org/busterjs/ramp)

A ramp that makes browsers crash and burn, and hopefully run some tests.

## Running tests

Ramp is actually about loading a document of your choice (by default a plain html5 doc) and a bunch of scripts into a browser, and set it up so you can emit events to and from the browsers and a central hub that gets events from all browsers passed to it.

This is what Buster.JS uses to run tests. The central hub emits an event when the test run should start, the slaves emits events when tests fail or pass, and so on.

But you can use ramp to whatever. Not just running tests.

## Examples

So, yeah.


## Changelog

**2.0.2** (2016-Jul-18)

* Lock down faye version

**2.0.1** (2015-Nov-28)

* `2.0.0` was based off of a broken version of `ramp-resources` - this fixes `resourceSet.concat()` usages to be promise based

**2.0.0** (2015-Nov-24)

* updated dependencies and supported node versions
* breaking: using `when@3` (instead of v1) and `ramp-resources@2.x`

**1.0.6** (2014-Oct-15)

* `/slave_death` event is now published

**1.0.5** (2014-Sep-30)

* it is now possible to pass slave id as url param

**1.0.4** (2014-May-14)

* support for static paths
* `"SIGINT"` isn't hooked anymore
